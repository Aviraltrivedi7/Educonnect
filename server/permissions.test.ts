import { describe, expect, it } from "vitest";
import { userRoles } from "../drizzle/schema";
import { buildReminderTemplateReviewNotification } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function anonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

function studentContext(): TrpcContext {
  const now = new Date();
  return {
    user: { id: 17, openId: "student-test", name: "Student Test", email: "student@example.test", loginMethod: "manus", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

function teacherContext(): TrpcContext {
  const now = new Date();
  return {
    user: { id: 18, openId: "teacher-test", name: "Teacher Test", email: "teacher@example.test", loginMethod: "manus", role: "teacher", createdAt: now, updatedAt: now, lastSignedIn: now },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

describe("Educonnect authorization contract", () => {
  it("keeps the explicit student, teacher, and admin role set", () => {
    expect(userRoles).toEqual(["user", "teacher", "admin"]);
  });

  it("includes required rejection feedback in the teacher notification contract", () => {
    const notification = buildReminderTemplateReviewNotification("Weekly check-in", false, "Please make the message more specific to the assignment.");
    expect(notification.title).toBe("Reminder template needs changes");
    expect(notification.body).toContain("Weekly check-in");
    expect(notification.body).toContain("Please make the message more specific to the assignment.");
    expect(notification.href).toBe("/app#dashboard");
  });

  it("blocks anonymous access to the protected dashboard procedure", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.workspace.dashboard()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("blocks anonymous access to the administrator-only backup workflow", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.governance.requestBackup()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("blocks anonymous access to notifications, assessments, and AI study plans", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.notifications.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.notifications.inbox()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.notifications.preferences()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.notifications.updatePreferences({ staffUpdatesEnabled: true, gradeUpdatesEnabled: true, assessmentUpdatesEnabled: true, learningRemindersEnabled: true, emailDeliveryEnabled: false, pushDeliveryEnabled: false, reminderEnabled: false, reminderTimeUtc: "09:00", reminderTimezone: "UTC", reminderWeekdaysOnly: true })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.studentProgress()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.studentWeeklyTrend()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.studentTrendExportHistory()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.createStudentTrendExport({ weeks: 4 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.activityFilterPresets()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.sharedActivityFilterPresetTemplates()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.setActivityFilterPresetFavorite({ presetId: 1, isFavorite: true })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.activityFilterPresetFavoriteFolders()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.bulkArchiveStudentTrendExports({ exportIds: [1] })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.bulkDeleteStudentTrendExports({ exportIds: [1] })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.bulkRestoreStudentTrendExports({ exportIds: [1] })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.studentTrendExportRetention()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.updateStudentTrendExportRetention({ enabled: true, retentionDays: 30 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.studentTrendExportRetentionRuns()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.studentAssessmentFeedbackAnalytics()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.studentEngagementSummary()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.createStudentAchievementCertificate({ milestoneId: "streak-3" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.revokeStudentAchievementCertificate({ milestoneId: "streak-3" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.studentLearningFocus()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.teacherLearnerAttention()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.sendTeacherBulkLearningReminder({ target: "all" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.teacherReminderTemplates()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.createTeacherReminderTemplate({ name: "Check in", note: "Please review your work." })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.workspace.interventionAnalytics()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.exportInterventionAnalytics()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.recentActivities({ subject: "Mathematics", classSection: "Grade 10 · A" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.assessments.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.ai.studyPlan({ learningContext: "I need a short plan for algebra practice this week." })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("blocks students from authoring teacher-only assessments", async () => {
    const caller = appRouter.createCaller(studentContext());
    await expect(caller.assessments.create({ courseId: 1, title: "Algebra check", durationMinutes: 30, publish: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks students from all teacher-only course, grading, and notification operations", async () => {
    const caller = appRouter.createCaller(studentContext());
    await expect(caller.courses.create({ code: "MTH101", title: "Math foundations" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.assignments.grade({ submissionId: 1, score: 10, feedback: "Nice work" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.notifications.create({ recipientId: 2, title: "Reminder", body: "Please review the module." })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.activityFilterPresets()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.saveActivityFilterPreset({ name: "My class" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.setDefaultActivityFilterPreset({ presetId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.resetDefaultActivityFilterPreset()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.setActivityFilterPresetShared({ presetId: 1, isShared: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.setActivityFilterPresetFavorite({ presetId: 1, isFavorite: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.createActivityFilterPresetFavoriteFolder({ name: "Priority" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.assignActivityFilterPresetFavoriteFolder({ presetId: 1, folderId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.reorderActivityFilterPresetFavoriteFolders({ folderIds: [1] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.setActivityFilterPresetFavoriteFolderColor({ folderId: 1, color: "#52749a" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.copySharedActivityFilterPresetTemplate({ templateId: 1, name: "Algebra overview" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.teacherLearnerAttention()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.sendTeacherBulkLearningReminder({ target: "all" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.teacherReminderTemplates()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.createTeacherReminderTemplate({ name: "Check in", note: "Please review your work." })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.setTeacherReminderTemplateShared({ templateId: 1, isShared: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.teacherRejectionFeedbackHistory()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.schoolReminderTemplateLibrary()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.copySchoolReminderTemplate({ templateId: 1, name: "Copy" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.certificateRevocationAudit()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.exportCertificateRevocationAudit()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.revokeCertificateForAdmin({ certificateId: 1, reason: "Governance review" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.reminderTemplateApprovalQueue()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.reviewReminderTemplateSubmission({ templateId: 1, approved: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.monthlyCertificateAuditReportSchedule()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.updateMonthlyCertificateAuditReportSchedule({ enabled: true, recipientIds: [1] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.monthlyComparisonReviewSchedule()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.updateMonthlyComparisonReviewSchedule({ enabled: true, recipientIds: [1], expiryWarningDays: 14 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.adminInterventionComparisonViews()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.createAdminInterventionComparisonView({ name: "Support cohort", normalized: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.deleteAdminInterventionComparisonView({ viewId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.setAdminInterventionComparisonViewSharing({ viewId: 1, share: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.sharedAdminInterventionComparisonView({ shareToken: "sufficiently-long-non-public-share-token" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.adminComparisonSharingActivity()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.adminComparisonSharingAuditSummary()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.exportAdminComparisonSharingAudit()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.adminComparisonSharingAuditExports()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.setAdminComparisonSharingAuditExportArchived({ exportId: 1, archived: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.interventionAnalytics()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.workspace.exportInterventionAnalytics()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an inverted activity date range before it reaches the database", async () => {
    const caller = appRouter.createCaller(studentContext());
    await expect(caller.workspace.recentActivities({ startAt: new Date("2026-08-19T00:00:00Z"), endAt: new Date("2026-08-18T23:59:59Z") })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an inverted trend export history date range before it reaches the database", async () => {
    const caller = appRouter.createCaller(studentContext());
    await expect(caller.workspace.studentTrendExportHistory({ startAt: new Date("2026-08-19T00:00:00Z"), endAt: new Date("2026-08-18T23:59:59Z") })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects unsupported student trend ranges before it reaches the database", async () => {
    const caller = appRouter.createCaller(studentContext());
    await expect(caller.workspace.studentWeeklyTrend({ weeks: 6 as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.workspace.createStudentTrendExport({ weeks: 6 as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects empty bulk export operations before they reach the database", async () => {
    const caller = appRouter.createCaller(studentContext());
    await expect(caller.workspace.bulkArchiveStudentTrendExports({ exportIds: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.workspace.bulkDeleteStudentTrendExports({ exportIds: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.workspace.bulkRestoreStudentTrendExports({ exportIds: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.workspace.updateStudentTrendExportRetention({ enabled: true, retentionDays: 14 as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an invalid UTC reminder time before it reaches scheduling or persistence", async () => {
    const caller = appRouter.createCaller(studentContext());
    await expect(caller.notifications.updatePreferences({ staffUpdatesEnabled: true, gradeUpdatesEnabled: true, assessmentUpdatesEnabled: true, learningRemindersEnabled: true, emailDeliveryEnabled: false, pushDeliveryEnabled: false, reminderEnabled: true, reminderTimeUtc: "25:90", reminderTimezone: "UTC", reminderWeekdaysOnly: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a malformed reminder timezone before scheduling or persistence", async () => {
    const caller = appRouter.createCaller(studentContext());
    await expect(caller.notifications.updatePreferences({ staffUpdatesEnabled: true, gradeUpdatesEnabled: true, assessmentUpdatesEnabled: true, learningRemindersEnabled: true, emailDeliveryEnabled: false, pushDeliveryEnabled: false, reminderEnabled: true, reminderTimeUtc: "09:00", reminderTimezone: "not/a-real-timezone", reminderWeekdaysOnly: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an oversized personalized bulk reminder note before notification delivery", async () => {
    const caller = appRouter.createCaller(teacherContext());
    await expect(caller.workspace.sendTeacherBulkLearningReminder({ target: "all", personalNote: "x".repeat(501) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an oversized certificate revocation reason before it reaches the database", async () => {
    const caller = appRouter.createCaller(studentContext());
    await expect(caller.workspace.revokeStudentAchievementCertificate({ milestoneId: "streak-3", reason: "x".repeat(301) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
