import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, or } from "drizzle-orm";
import { adminInterventionComparisonViews, auditLogs, comparisonSharingExportRetentionPolicies, comparisonSharingExportRetentionRuns, monthlyComparisonReviewSchedules, notificationPreferences, notifications, reportExports, schools, teacherReminderTemplates, users } from "../drizzle/schema";
import { cleanupExpiredComparisonSharingAuditExports, createAdminComparisonSharingAuditExport, deliverScheduledMonthlyComparisonReview, getAdminComparisonSharingAuditSummary, getDb, listAdminComparisonSharingAuditExports, setAdminComparisonSharingAuditExportArchived } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const runKey = `acceptance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let schoolId = 0;
let adminId = 0;
let teacherId = 0;

function context(id: number, role: "admin" | "teacher"): TrpcContext {
  const now = new Date();
  return { user: { id, openId: `${runKey}-${role}`, name: `Acceptance ${role}`, email: `${role}.${runKey}@example.test`, loginMethod: "acceptance", role, createdAt: now, updatedAt: now, lastSignedIn: now }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as unknown as TrpcContext["res"] };
}

describe("administrator acceptance workflow with real persisted data", () => {
  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Acceptance test requires the managed database connection.");
    const schoolInsert = await db.insert(schools).values({ name: `Acceptance School ${runKey}`, slug: runKey, timezone: "UTC" });
    schoolId = Number(schoolInsert[0].insertId);
    const adminInsert = await db.insert(users).values({ openId: `${runKey}-admin`, schoolId, name: "Acceptance Administrator", email: `admin.${runKey}@example.test`, loginMethod: "acceptance", role: "admin", profileComplete: true });
    adminId = Number(adminInsert[0].insertId);
    const teacherInsert = await db.insert(users).values({ openId: `${runKey}-teacher`, schoolId, name: "Acceptance Teacher", email: `teacher.${runKey}@example.test`, loginMethod: "acceptance", role: "teacher", profileComplete: true });
    teacherId = Number(teacherInsert[0].insertId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db || !schoolId) return;
    await db.delete(notifications).where(or(eq(notifications.recipientId, teacherId), eq(notifications.createdBy, adminId)));
    await db.delete(notificationPreferences).where(eq(notificationPreferences.userId, teacherId));
    await db.delete(notificationPreferences).where(eq(notificationPreferences.userId, adminId));
    await db.delete(reportExports).where(eq(reportExports.requestedBy, adminId));
    await db.delete(comparisonSharingExportRetentionRuns).where(eq(comparisonSharingExportRetentionRuns.schoolId, schoolId));
    await db.delete(comparisonSharingExportRetentionPolicies).where(eq(comparisonSharingExportRetentionPolicies.schoolId, schoolId));
    await db.delete(monthlyComparisonReviewSchedules).where(eq(monthlyComparisonReviewSchedules.schoolId, schoolId));
    await db.delete(teacherReminderTemplates).where(eq(teacherReminderTemplates.schoolId, schoolId));
    await db.delete(adminInterventionComparisonViews).where(eq(adminInterventionComparisonViews.schoolId, schoolId));
    await db.delete(auditLogs).where(eq(auditLogs.schoolId, schoolId));
    await db.delete(users).where(or(eq(users.id, teacherId), eq(users.id, adminId)));
    await db.delete(schools).where(eq(schools.id, schoolId));
  });

  it("protects a saved comparison link and delivers mandatory rejection feedback", async () => {
    const db = await getDb();
    if (!db) throw new Error("Acceptance test requires the managed database connection.");
    const admin = appRouter.createCaller(context(adminId, "admin"));
    const teacher = appRouter.createCaller(context(teacherId, "teacher"));

    const comparisonId = await admin.workspace.createAdminInterventionComparisonView({ name: "Acceptance protected comparison", normalized: true });
    const shared = await admin.workspace.setAdminInterventionComparisonViewSharing({ viewId: comparisonId, share: true, expiresAt: new Date(Date.now() + 7 * 86_400_000), password: "Acceptance9!" });
    expect(shared.shareToken).toHaveLength(48);
    expect(shared.passwordProtected).toBe(true);
    expect((await admin.workspace.sharedAdminInterventionComparisonView({ shareToken: shared.shareToken!, password: undefined })).status).toBe("password_required");
    expect((await admin.workspace.sharedAdminInterventionComparisonView({ shareToken: shared.shareToken!, password: "incorrect9!" })).status).toBe("password_required");
    const unlocked = await admin.workspace.sharedAdminInterventionComparisonView({ shareToken: shared.shareToken!, password: "Acceptance9!" });
    expect(unlocked).toMatchObject({ status: "ready", id: comparisonId, name: "Acceptance protected comparison", normalized: true });

    const templateId = await teacher.workspace.createTeacherReminderTemplate({ name: "Acceptance pending reminder", note: "Please review your current assignment before Friday." });
    await teacher.workspace.setTeacherReminderTemplateShared({ templateId, isShared: true });
    const queued = await admin.workspace.reminderTemplateApprovalQueue();
    expect(queued.some(template => template.id === templateId)).toBe(true);
    await admin.workspace.reviewReminderTemplateSubmission({ templateId, approved: false, reviewNote: "Please identify the exact assignment and expected next action." });

    const template = (await db.select().from(teacherReminderTemplates).where(eq(teacherReminderTemplates.id, templateId)).limit(1))[0];
    expect(template).toMatchObject({ sharingStatus: "rejected", isShared: false, reviewNote: "Please identify the exact assignment and expected next action." });
    const teacherNotification = (await db.select().from(notifications).where(and(eq(notifications.recipientId, teacherId), eq(notifications.createdBy, adminId), eq(notifications.title, "Reminder template needs changes"))).limit(1))[0];
    expect(teacherNotification?.body).toContain("Please identify the exact assignment and expected next action.");
    await teacher.workspace.setTeacherReminderTemplateShared({ templateId, isShared: true });
    const resubmittedTemplate = (await db.select().from(teacherReminderTemplates).where(eq(teacherReminderTemplates.id, templateId)).limit(1))[0];
    expect(resubmittedTemplate).toMatchObject({ sharingStatus: "pending", isShared: false, reviewNote: null });
  });

  it("reviews published comparison links monthly, revokes expired links, and delivers one idempotent admin notification", async () => {
    const db = await getDb();
    if (!db) throw new Error("Acceptance test requires the managed database connection.");
    const admin = appRouter.createCaller(context(adminId, "admin"));
    const expiredId = await admin.workspace.createAdminInterventionComparisonView({ name: "Acceptance expired comparison", normalized: false });
    const expiredShare = await admin.workspace.setAdminInterventionComparisonViewSharing({ viewId: expiredId, share: true, expiresAt: new Date(Date.now() + 3 * 86_400_000), password: "Acceptance9!" });
    await db.update(adminInterventionComparisonViews).set({ shareExpiresAt: new Date(Date.now() - 60_000) }).where(eq(adminInterventionComparisonViews.id, expiredId));
    const activeId = await admin.workspace.createAdminInterventionComparisonView({ name: "Acceptance active comparison", normalized: true });
    await admin.workspace.setAdminInterventionComparisonViewSharing({ viewId: activeId, share: true, expiresAt: new Date(Date.now() + 2 * 86_400_000) });
    const taskUid = `${runKey}-monthly-review`;
    await db.insert(monthlyComparisonReviewSchedules).values({ schoolId, configuredBy: adminId, recipientIds: [adminId], enabled: true, expiryWarningDays: 7, scheduleCronTaskUid: taskUid });

    const result = await deliverScheduledMonthlyComparisonReview(taskUid);
    expect(result).toMatchObject({ ok: true, active: 2, expiring: 2, protected: 1, unprotected: 1, revoked: 1 });
    const expiredView = (await db.select().from(adminInterventionComparisonViews).where(eq(adminInterventionComparisonViews.id, expiredId)).limit(1))[0];
    expect(expiredView.shareToken).toBeNull();
    const notification = (await db.select().from(notifications).where(and(eq(notifications.recipientId, adminId), eq(notifications.title, "Monthly comparison sharing review is ready"))).limit(1))[0];
    expect(notification?.body).toContain("automatically revoked");
    const summary = await getAdminComparisonSharingAuditSummary(adminId);
    expect(summary).toMatchObject({ activeLinks: 2, expiringLinks: 2, passwordProtectedLinks: 1, openLinks: 1, automaticRevocations: 1 });
    const csvExport = await createAdminComparisonSharingAuditExport(adminId);
    expect(csvExport).toMatchObject({ eventCount: expect.any(Number) });
    expect(csvExport.url).toContain("comparison-sharing-audit");
    const exportRow = (await db.select().from(reportExports).where(eq(reportExports.id, csvExport.id)).limit(1))[0];
    expect(exportRow.status).toBe("ready");
    await expect(listAdminComparisonSharingAuditExports(adminId)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: csvExport.id, status: "ready" })]));
    await expect(listAdminComparisonSharingAuditExports(adminId, { startAt: new Date(Date.now() - 86_400_000), endAt: new Date(Date.now() + 86_400_000), status: "ready" })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: csvExport.id })]));
    await expect(setAdminComparisonSharingAuditExportArchived(adminId, csvExport.id, true)).resolves.toMatchObject({ id: csvExport.id, archivedAt: expect.any(Date) });
    await expect(listAdminComparisonSharingAuditExports(adminId, { archived: true })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: csvExport.id })]));
    await expect(setAdminComparisonSharingAuditExportArchived(adminId, csvExport.id, false)).resolves.toMatchObject({ id: csvExport.id, archivedAt: null });
    const oldExportInsert = await db.insert(reportExports).values({ requestedBy: adminId, type: "system", filterSnapshot: { report: "comparison_sharing_activity", generatedAt: "acceptance" }, storageKey: `acceptance/${runKey}.csv`, status: "ready" });
    const oldExportId = Number(oldExportInsert[0].insertId);
    await db.update(reportExports).set({ createdAt: new Date(Date.now() - 91 * 86_400_000) }).where(eq(reportExports.id, oldExportId));
    const retentionTaskUid = `${runKey}-comparison-export-retention`;
    const policyInsert = await db.insert(comparisonSharingExportRetentionPolicies).values({ schoolId, configuredBy: adminId, enabled: true, retentionDays: 30, scheduleCronTaskUid: retentionTaskUid });
    expect(await cleanupExpiredComparisonSharingAuditExports(retentionTaskUid)).toMatchObject({ ok: true, deletedCount: 1 });
    expect((await db.select().from(reportExports).where(eq(reportExports.id, oldExportId)).limit(1)).length).toBe(0);
    await expect(cleanupExpiredComparisonSharingAuditExports(retentionTaskUid)).resolves.toMatchObject({ ok: true, deletedCount: 0 });
    expect(Number(policyInsert[0].insertId)).toBeGreaterThan(0);
    await expect(deliverScheduledMonthlyComparisonReview(taskUid)).resolves.toMatchObject({ ok: true, skipped: "already-reviewed" });
    expect(expiredShare.shareToken).toHaveLength(48);
  }, 20_000);
});
