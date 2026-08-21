import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  activityFilterPresetFavoriteFolders,
  activityFilterPresetFavorites,
  activityFilterPresets,
  adminInterventionComparisonViews,
  aiRuns,
  assignments,
  auditLogs,
  backupJobs,
  comparisonSharingExportRetentionPolicies,
  comparisonSharingExportRetentionRuns,
  conversationParticipants,
  conversations,
  courseModules,
  courses,
  enrollments,
  examQuestions,
  exams,
  lessons,
  lessonProgress,
  monthlyCertificateAuditReportSchedules,
  monthlyComparisonReviewSchedules,
  messages,
  mistakeEntries,
  notificationPreferences,
  notifications,
  quizAttempts,
  reportExports,
  scheduleEvents,
  schoolInvites,
  schools,
  studentAchievementCertificates,
  studentEngagementDays,
  submissions,
  teacherReminderTemplates,
  trendExportDownloads,
  trendExportRetentionPolicies,
  trendExportRetentionRuns,
  type InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { nanoid } from "nanoid";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { storageGet, storagePut } from "./storage";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";

let database: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!database && process.env.DATABASE_URL) {
    database = drizzle(process.env.DATABASE_URL);
  }
  return database;
}

function requireDb(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new Error("The Educonnect database is not configured.");
  return db;
}

async function recordStudentEngagement(userId: number, now = new Date()) {
  const db = requireDb(await getDb());
  const activityDate = now.toISOString().slice(0, 10);
  await db.insert(studentEngagementDays).values({ studentId: userId, activityDate, activityCount: 1, firstActivityAt: now, lastActivityAt: now }).onDuplicateKeyUpdate({ set: { activityCount: sql`${studentEngagementDays.activityCount} + 1`, lastActivityAt: now } });
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required.");
  const db = await getDb();
  if (!db) return;
  const role = user.openId === ENV.ownerOpenId ? "admin" : user.role ?? "user";
  await db
    .insert(users)
    .values({ ...user, role, lastSignedIn: user.lastSignedIn ?? new Date() })
    .onDuplicateKeyUpdate({
      set: {
        name: user.name ?? null,
        email: user.email ?? null,
        loginMethod: user.loginMethod ?? null,
        lastSignedIn: new Date(),
        ...(user.openId === ENV.ownerOpenId ? { role: "admin" as const } : {}),
      },
    });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return rows[0];
}

export async function audit(actorId: number | null, schoolId: number | null, action: string, entityType: string, entityId?: string, metadata?: Record<string, unknown>) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values({ actorId, schoolId, action, entityType, entityId, metadata });
}

export async function getWorkspace(userId: number) {
  const db = requireDb(await getDb());
  const profile = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = profile[0];
  if (!user) throw new Error("Authenticated profile was not found.");
  const school = user.schoolId ? (await db.select().from(schools).where(eq(schools.id, user.schoolId)).limit(1))[0] : undefined;
  return { user, school };
}

export async function initializeWorkspace(userId: number, schoolName: string) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin") throw new Error("Only an administrator can initialize a school workspace.");
  if (profile.user.schoolId) return profile;
  const slugBase = schoolName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 72) || "educonnect";
  const slug = `${slugBase}-${Date.now().toString(36)}`;
  const inserted = await db.insert(schools).values({ name: schoolName, slug });
  const schoolId = Number(inserted[0].insertId);
  await db.update(users).set({ schoolId, profileComplete: true }).where(eq(users.id, userId));
  await audit(userId, schoolId, "workspace.initialized", "school", String(schoolId), { schoolName });
  return getWorkspace(userId);
}

export async function createSchoolInvite(actorId: number, role: "user" | "teacher" | "admin") {
  const db = requireDb(await getDb());
  const actor = await getWorkspace(actorId);
  if (actor.user.role !== "admin" || !actor.user.schoolId) throw new Error("Only administrators can create school invites.");
  const code = nanoid(24);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const inserted = await db.insert(schoolInvites).values({ schoolId: actor.user.schoolId, createdBy: actorId, code, role, expiresAt });
  const inviteId = Number(inserted[0].insertId);
  await audit(actorId, actor.user.schoolId, "school.invite.created", "schoolInvite", String(inviteId), { role, expiresAt: expiresAt.toISOString() });
  return { id: inviteId, code, role, expiresAt };
}

export async function listSchoolInvites(actorId: number) {
  const db = requireDb(await getDb());
  const actor = await getWorkspace(actorId);
  if (actor.user.role !== "admin" || !actor.user.schoolId) throw new Error("Only administrators can review school invites.");
  return db.select().from(schoolInvites).where(eq(schoolInvites.schoolId, actor.user.schoolId)).orderBy(desc(schoolInvites.createdAt)).limit(30);
}

export async function revokeSchoolInvite(actorId: number, inviteId: number) {
  const db = requireDb(await getDb());
  const actor = await getWorkspace(actorId);
  if (actor.user.role !== "admin" || !actor.user.schoolId) throw new Error("Only administrators can revoke school invites.");
  const invite = (await db.select().from(schoolInvites).where(and(eq(schoolInvites.id, inviteId), eq(schoolInvites.schoolId, actor.user.schoolId))).limit(1))[0];
  if (!invite) throw new Error("Invite not found in the active school.");
  if (invite.acceptedAt) throw new Error("An accepted invite cannot be revoked.");
  await db.delete(schoolInvites).where(eq(schoolInvites.id, inviteId));
  await audit(actorId, actor.user.schoolId, "school.invite.revoked", "schoolInvite", String(inviteId));
  return { id: inviteId, revoked: true as const };
}

export async function acceptSchoolInvite(userId: number, code: string) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.schoolId) throw new Error("This account is already assigned to a school workspace.");
  const invite = (await db.select().from(schoolInvites).where(eq(schoolInvites.code, code)).limit(1))[0];
  if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) throw new Error("This invite is invalid, expired, or already used.");
  await db.update(users).set({ schoolId: invite.schoolId, role: invite.role, profileComplete: true }).where(eq(users.id, userId));
  await db.update(schoolInvites).set({ acceptedBy: userId, acceptedAt: new Date() }).where(eq(schoolInvites.id, invite.id));
  await audit(userId, invite.schoolId, "school.invite.accepted", "schoolInvite", String(invite.id), { role: invite.role });
  return getWorkspace(userId);
}

export async function updateProfileRole(actorId: number, userId: number, role: "user" | "teacher" | "admin") {
  const db = requireDb(await getDb());
  const actor = await getWorkspace(actorId);
  if (actor.user.role !== "admin") throw new Error("Only administrators can manage roles.");
  await db.update(users).set({ role }).where(eq(users.id, userId));
  await audit(actorId, actor.user.schoolId, "user.role.updated", "user", String(userId), { role });
}

export async function listUsers(schoolId: number) {
  const db = requireDb(await getDb());
  return db.select().from(users).where(eq(users.schoolId, schoolId)).orderBy(asc(users.name));
}

export async function createCourse(actorId: number, input: { code: string; title: string; description?: string; subject?: string; classSection?: string }) {
  const db = requireDb(await getDb());
  const actor = await getWorkspace(actorId);
  if (!actor.user.schoolId || !["teacher", "admin"].includes(actor.user.role)) throw new Error("Only teachers and administrators can create courses.");
  const inserted = await db.insert(courses).values({ schoolId: actor.user.schoolId, teacherId: actorId, code: input.code, title: input.title, subject: input.subject, classSection: input.classSection, description: input.description, status: "draft" });
  const courseId = Number(inserted[0].insertId);
  await audit(actorId, actor.user.schoolId, "course.created", "course", String(courseId), { code: input.code });
  return courseId;
}

export async function publishCourse(actorId: number, courseId: number) {
  const { db, actor } = await requireCourseManager(actorId, courseId);
  await db.update(courses).set({ status: "published" }).where(eq(courses.id, courseId));
  await audit(actorId, actor.user.schoolId, "course.published", "course", String(courseId));
}

async function requireCourseManager(actorId: number, courseId: number) {
  const db = requireDb(await getDb());
  const actor = await getWorkspace(actorId);
  if (!["teacher", "admin"].includes(actor.user.role) || !actor.user.schoolId) throw new Error("Only teachers and administrators can manage course content.");
  const course = (await db.select().from(courses).where(and(eq(courses.id, courseId), eq(courses.schoolId, actor.user.schoolId))).limit(1))[0];
  if (!course || (actor.user.role === "teacher" && course.teacherId !== actorId)) throw new Error("You do not have permission to manage this course.");
  return { db, actor, course };
}

export async function createModule(actorId: number, input: { courseId: number; title: string; position: number }) {
  const { db, actor } = await requireCourseManager(actorId, input.courseId);
  const inserted = await db.insert(courseModules).values(input);
  const moduleId = Number(inserted[0].insertId);
  await audit(actorId, actor.user.schoolId, "course.module.created", "courseModule", String(moduleId), { courseId: input.courseId });
  return moduleId;
}

export async function createLesson(actorId: number, input: { moduleId: number; title: string; content?: string; videoUrl?: string; resourceUrl?: string; durationMinutes: number; position: number; publish: boolean }) {
  const db = requireDb(await getDb());
  const module = (await db.select().from(courseModules).where(eq(courseModules.id, input.moduleId)).limit(1))[0];
  if (!module) throw new Error("Module not found.");
  const { actor } = await requireCourseManager(actorId, module.courseId);
  const inserted = await db.insert(lessons).values({ moduleId: input.moduleId, title: input.title, content: input.content, videoUrl: input.videoUrl, resourceUrl: input.resourceUrl, durationMinutes: input.durationMinutes, position: input.position, isPublished: input.publish });
  const lessonId = Number(inserted[0].insertId);
  await audit(actorId, actor.user.schoolId, "course.lesson.created", "lesson", String(lessonId), { moduleId: input.moduleId, published: input.publish });
  return lessonId;
}

export async function listCoursesForUser(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (!profile.user.schoolId) return [];
  if (profile.user.role === "user") {
    return db
      .select({ course: courses, enrollment: enrollments })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .where(and(eq(enrollments.studentId, userId), eq(courses.schoolId, profile.user.schoolId)))
      .orderBy(desc(enrollments.enrolledAt));
  }
  return db.select({ course: courses }).from(courses).where(eq(courses.schoolId, profile.user.schoolId)).orderBy(desc(courses.updatedAt));
}

export async function enrollStudent(actorId: number, courseId: number, studentId: number) {
  const { db, actor } = await requireCourseManager(actorId, courseId);
  const learner = (await db.select().from(users).where(and(eq(users.id, studentId), eq(users.schoolId, actor.user.schoolId!))).limit(1))[0];
  if (!learner || learner.role !== "user") throw new Error("Only student members of this school can be enrolled.");
  await db.insert(enrollments).values({ courseId, studentId }).onDuplicateKeyUpdate({ set: { status: "active" } });
  await audit(actorId, actor.user.schoolId, "enrollment.created", "course", String(courseId), { studentId });
}

export async function getCourseDetail(userId: number, courseId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  const course = (await db.select().from(courses).where(and(eq(courses.id, courseId), eq(courses.schoolId, profile.user.schoolId!))).limit(1))[0];
  if (!course) throw new Error("Course not found in the active school.");
  if (profile.user.role === "user") {
    const enrollment = (await db.select().from(enrollments).where(and(eq(enrollments.courseId, courseId), eq(enrollments.studentId, userId), eq(enrollments.status, "active"))).limit(1))[0];
    if (!enrollment || course.status !== "published") throw new Error("This course is not available to you.");
  } else if (profile.user.role === "teacher" && course.teacherId !== userId) {
    throw new Error("You do not have permission to view this managed course.");
  }
  const modules = await db.select().from(courseModules).where(eq(courseModules.courseId, courseId)).orderBy(asc(courseModules.position));
  const moduleIds = modules.map(module => module.id);
  const lessonRows = moduleIds.length ? await Promise.all(moduleIds.map(moduleId => db.select().from(lessons).where(profile.user.role === "user" ? and(eq(lessons.moduleId, moduleId), eq(lessons.isPublished, true)) : eq(lessons.moduleId, moduleId)).orderBy(asc(lessons.position)))) : [];
  const progress = profile.user.role === "user" ? await db.select().from(lessonProgress).where(eq(lessonProgress.studentId, userId)) : [];
  return { course, modules: modules.map((module, index) => ({ ...module, lessons: lessonRows[index] ?? [] })), progress };
}

export async function setLessonProgress(userId: number, lessonId: number, resumeSecond: number, completed: boolean) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") throw new Error("Only students can record lesson progress.");
  const lesson = (await db.select({ lesson: lessons, module: courseModules, course: courses }).from(lessons).innerJoin(courseModules, eq(courseModules.id, lessons.moduleId)).innerJoin(courses, eq(courses.id, courseModules.courseId)).where(eq(lessons.id, lessonId)).limit(1))[0];
  if (!lesson || lesson.course.status !== "published" || !lesson.lesson.isPublished) throw new Error("This lesson is not available for progress tracking.");
  const enrollment = (await db.select().from(enrollments).where(and(eq(enrollments.courseId, lesson.course.id), eq(enrollments.studentId, userId), eq(enrollments.status, "active"))).limit(1))[0];
  if (!enrollment) throw new Error("You are not enrolled in this lesson's course.");
  await db.insert(lessonProgress).values({ lessonId, studentId: userId, resumeSecond, completed, completedAt: completed ? new Date() : null }).onDuplicateKeyUpdate({ set: { resumeSecond, completed, completedAt: completed ? new Date() : null } });
  await recordStudentEngagement(userId);
  await audit(userId, profile.user.schoolId, completed ? "lesson.completed" : "lesson.resumed", "lesson", String(lessonId), { resumeSecond });
}

export async function listAssignments(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (!profile.user.schoolId) return [];
  if (profile.user.role === "user") {
    return db
      .select({ assignment: assignments, course: courses, submission: submissions })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .innerJoin(assignments, eq(assignments.courseId, courses.id))
      .leftJoin(submissions, and(eq(submissions.assignmentId, assignments.id), eq(submissions.studentId, userId)))
      .where(and(eq(enrollments.studentId, userId), eq(assignments.status, "published")))
      .orderBy(asc(assignments.dueAt));
  }
  return db.select({ assignment: assignments, course: courses }).from(assignments).innerJoin(courses, eq(courses.id, assignments.courseId)).where(eq(courses.schoolId, profile.user.schoolId)).orderBy(desc(assignments.createdAt));
}

export async function createAssignment(actorId: number, input: { courseId: number; title: string; instructions: string; dueAt?: Date; maxPoints: number; publish: boolean }) {
  const { db, actor } = await requireCourseManager(actorId, input.courseId);
  const inserted = await db.insert(assignments).values({ ...input, authorId: actorId, status: input.publish ? "published" : "draft" });
  const assignmentId = Number(inserted[0].insertId);
  await audit(actorId, actor.user.schoolId, "assignment.created", "assignment", String(assignmentId), { courseId: input.courseId, published: input.publish });
  return assignmentId;
}

export async function submitAssignment(userId: number, assignmentId: number, body: string, attachmentUrl?: string) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") throw new Error("Only students can submit assignments.");
  const assignment = (await db.select({ assignment: assignments, course: courses }).from(assignments).innerJoin(courses, eq(courses.id, assignments.courseId)).where(eq(assignments.id, assignmentId)).limit(1))[0];
  if (!assignment || assignment.assignment.status !== "published") throw new Error("This assignment is not available.");
  const enrollment = (await db.select().from(enrollments).where(and(eq(enrollments.courseId, assignment.course.id), eq(enrollments.studentId, userId), eq(enrollments.status, "active"))).limit(1))[0];
  if (!enrollment) throw new Error("You are not enrolled in this assignment's course.");
  await db.insert(submissions).values({ assignmentId, studentId: userId, body, attachmentUrl, submittedAt: new Date(), status: "submitted" }).onDuplicateKeyUpdate({ set: { body, attachmentUrl, submittedAt: new Date(), status: "submitted" } });
  await recordStudentEngagement(userId);
  await audit(userId, profile.user.schoolId, "assignment.submitted", "assignment", String(assignmentId));
}

export async function gradeSubmission(actorId: number, submissionId: number, score: number, feedback: string) {
  const db = requireDb(await getDb());
  const submission = (await db.select({ submission: submissions, assignment: assignments }).from(submissions).innerJoin(assignments, eq(assignments.id, submissions.assignmentId)).where(eq(submissions.id, submissionId)).limit(1))[0];
  if (!submission) throw new Error("Submission not found.");
  const { actor } = await requireCourseManager(actorId, submission.assignment.courseId);
  await db.update(submissions).set({ score, feedback, gradedBy: actorId, gradedAt: new Date(), status: "graded" }).where(eq(submissions.id, submission.submission.id));
  const preferences = await ensureNotificationPreferences(submission.submission.studentId);
  if (preferences.gradeUpdatesEnabled) await db.insert(notifications).values({ recipientId: submission.submission.studentId, createdBy: actorId, title: "New grade available", body: "A teacher has graded one of your assignments.", href: "/app#assignments" });
  await audit(actorId, actor.user.schoolId, "submission.graded", "submission", String(submissionId), { score });
}

export async function listSubmissionsForTeacher(actorId: number, courseId: number) {
  const { db } = await requireCourseManager(actorId, courseId);
  return db.select({ submission: submissions, assignment: assignments, student: users }).from(submissions).innerJoin(assignments, eq(assignments.id, submissions.assignmentId)).innerJoin(users, eq(users.id, submissions.studentId)).where(eq(assignments.courseId, courseId)).orderBy(desc(submissions.updatedAt));
}

export async function listMistakes(userId: number) {
  const db = requireDb(await getDb());
  return db.select().from(mistakeEntries).where(eq(mistakeEntries.studentId, userId)).orderBy(desc(mistakeEntries.updatedAt));
}

export async function saveMistake(userId: number, input: { id?: number; courseId?: number; topic: string; reflection: string; nextStep?: string; resolved?: boolean }) {
  const db = requireDb(await getDb());
  if (input.id) {
    await db.update(mistakeEntries).set({ topic: input.topic, reflection: input.reflection, nextStep: input.nextStep, resolved: input.resolved ?? false }).where(and(eq(mistakeEntries.id, input.id), eq(mistakeEntries.studentId, userId)));
    return input.id;
  }
  const inserted = await db.insert(mistakeEntries).values({ studentId: userId, courseId: input.courseId, topic: input.topic, reflection: input.reflection, nextStep: input.nextStep, resolved: input.resolved ?? false });
  await recordStudentEngagement(userId);
  return Number(inserted[0].insertId);
}

export async function listSchedule(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (!profile.user.schoolId) return [];
  return db.select().from(scheduleEvents).where(and(eq(scheduleEvents.schoolId, profile.user.schoolId), eq(scheduleEvents.ownerId, userId))).orderBy(asc(scheduleEvents.startsAt));
}

export async function createScheduleEvent(userId: number, input: { title: string; startsAt: Date; endsAt: Date; location?: string; courseId?: number; audience: "school" | "course" | "personal" }) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (!profile.user.schoolId) throw new Error("Complete school setup before adding a schedule event.");
  const inserted = await db.insert(scheduleEvents).values({ schoolId: profile.user.schoolId, ownerId: userId, ...input });
  const eventId = Number(inserted[0].insertId);
  await audit(userId, profile.user.schoolId, "schedule.created", "scheduleEvent", String(eventId));
  return eventId;
}

export async function getDashboard(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  const base = { role: profile.user.role, profile: profile.user, school: profile.school };
  if (!profile.user.schoolId) return { ...base, metrics: { courses: 0, assignments: 0, completedLessons: 0, pendingWork: 0 }, alerts: [] as string[] };
  if (profile.user.role === "user") {
    const [courseCount] = await db.select({ count: sql<number>`count(*)` }).from(enrollments).where(eq(enrollments.studentId, userId));
    const [completedCount] = await db.select({ count: sql<number>`count(*)` }).from(lessonProgress).where(and(eq(lessonProgress.studentId, userId), eq(lessonProgress.completed, true)));
    const [pendingCount] = await db.select({ count: sql<number>`count(*)` }).from(submissions).where(and(eq(submissions.studentId, userId), eq(submissions.status, "submitted")));
    return { ...base, metrics: { courses: Number(courseCount?.count ?? 0), assignments: 0, completedLessons: Number(completedCount?.count ?? 0), pendingWork: Number(pendingCount?.count ?? 0) }, alerts: [] as string[] };
  }
  const [courseCount] = await db.select({ count: sql<number>`count(*)` }).from(courses).where(eq(courses.schoolId, profile.user.schoolId));
  const [assignmentCount] = await db.select({ count: sql<number>`count(*)` }).from(assignments).innerJoin(courses, eq(courses.id, assignments.courseId)).where(eq(courses.schoolId, profile.user.schoolId));
  const [pendingCount] = await db.select({ count: sql<number>`count(*)` }).from(submissions).where(eq(submissions.status, "submitted"));
  return { ...base, metrics: { courses: Number(courseCount?.count ?? 0), assignments: Number(assignmentCount?.count ?? 0), completedLessons: 0, pendingWork: Number(pendingCount?.count ?? 0) }, alerts: [] as string[] };
}

export async function getStudentLearningFocus(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") throw new Error("Only students can review their learning focus.");
  const activeCourses = await db.select({ courseId: courses.id, courseCode: courses.code, courseTitle: courses.title }).from(enrollments).innerJoin(courses, eq(courses.id, enrollments.courseId)).where(and(eq(enrollments.studentId, userId), eq(enrollments.status, "active")));
  const courseIds = activeCourses.map(course => course.courseId);
  const modules = courseIds.length ? await db.select({ id: courseModules.id, courseId: courseModules.courseId }).from(courseModules).where(inArray(courseModules.courseId, courseIds)) : [];
  const moduleIds = modules.map(module => module.id);
  const courseByModule = new Map(modules.map(module => [module.id, module.courseId]));
  const publishedLessons = moduleIds.length ? await db.select({ id: lessons.id, moduleId: lessons.moduleId, title: lessons.title, durationMinutes: lessons.durationMinutes, position: lessons.position }).from(lessons).where(and(inArray(lessons.moduleId, moduleIds), eq(lessons.isPublished, true))).orderBy(asc(lessons.position)) : [];
  const progress = publishedLessons.length ? await db.select({ lessonId: lessonProgress.lessonId, completed: lessonProgress.completed }).from(lessonProgress).where(and(eq(lessonProgress.studentId, userId), inArray(lessonProgress.lessonId, publishedLessons.map(lesson => lesson.id)))) : [];
  const completedLessonIds = new Set(progress.filter(item => item.completed).map(item => item.lessonId));
  const nextLessonRow = publishedLessons.find(lesson => !completedLessonIds.has(lesson.id));
  const courseById = new Map(activeCourses.map(course => [course.courseId, course]));
  const nextLesson = nextLessonRow ? { lessonId: nextLessonRow.id, title: nextLessonRow.title, durationMinutes: nextLessonRow.durationMinutes, course: courseById.get(courseByModule.get(nextLessonRow.moduleId) ?? 0) } : null;
  const assignmentRows = courseIds.length ? await db.select({ assignmentId: assignments.id, title: assignments.title, dueAt: assignments.dueAt, maxPoints: assignments.maxPoints, courseCode: courses.code, courseTitle: courses.title, submissionStatus: submissions.status }).from(assignments).innerJoin(courses, eq(courses.id, assignments.courseId)).leftJoin(submissions, and(eq(submissions.assignmentId, assignments.id), eq(submissions.studentId, userId))).where(and(inArray(assignments.courseId, courseIds), eq(assignments.status, "published"))).orderBy(asc(assignments.dueAt)) : [];
  const upcomingAssignment = assignmentRows.find(assignment => assignment.submissionStatus !== "submitted" && assignment.submissionStatus !== "graded" && assignment.submissionStatus !== "returned" && (!assignment.dueAt || assignment.dueAt >= new Date())) ?? null;
  const assignmentFeedback = courseIds.length ? await db.select({ feedback: submissions.feedback, createdAt: submissions.gradedAt, title: assignments.title, courseCode: courses.code, kind: sql<string>`'assignment'` }).from(submissions).innerJoin(assignments, eq(assignments.id, submissions.assignmentId)).innerJoin(courses, eq(courses.id, assignments.courseId)).where(and(eq(submissions.studentId, userId), inArray(assignments.courseId, courseIds))) : [];
  const assessmentFeedback = courseIds.length ? await db.select({ feedback: quizAttempts.feedback, createdAt: quizAttempts.submittedAt, title: exams.title, courseCode: courses.code, kind: sql<string>`'assessment'` }).from(quizAttempts).innerJoin(exams, eq(exams.id, quizAttempts.examId)).innerJoin(courses, eq(courses.id, exams.courseId)).where(eq(quizAttempts.studentId, userId)) : [];
  const recentFeedback = [...assignmentFeedback, ...assessmentFeedback].filter(item => item.feedback?.trim() && item.createdAt).sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime()).slice(0, 3).map(item => ({ feedback: item.feedback!, createdAt: item.createdAt!, title: item.title, courseCode: item.courseCode, kind: item.kind }));
  return { nextLesson, upcomingAssignment, recentFeedback, activeCourseCount: activeCourses.length };
}

export async function getStudentEngagementSummary(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") throw new Error("Only students can review their engagement milestones.");
  const days = await db.select().from(studentEngagementDays).where(eq(studentEngagementDays.studentId, userId)).orderBy(desc(studentEngagementDays.activityDate)).limit(366);
  const activeDates = new Set(days.map(day => day.activityDate));
  const isoDate = (date: Date) => date.toISOString().slice(0, 10);
  const previousDay = (date: Date) => new Date(date.getTime() - 86_400_000);
  let cursor = new Date();
  if (!activeDates.has(isoDate(cursor))) cursor = previousDay(cursor);
  let currentStreak = 0;
  while (activeDates.has(isoDate(cursor))) { currentStreak += 1; cursor = previousDay(cursor); }
  const chronological = Array.from(activeDates).sort();
  let longestStreak = 0;
  let runningStreak = 0;
  let previousDate: string | undefined;
  chronological.forEach(date => { runningStreak = previousDate && date === isoDate(new Date(new Date(`${previousDate}T00:00:00.000Z`).getTime() + 86_400_000)) ? runningStreak + 1 : 1; longestStreak = Math.max(longestStreak, runningStreak); previousDate = date; });
  const [completedLessons] = await db.select({ count: sql<number>`count(*)` }).from(lessonProgress).where(and(eq(lessonProgress.studentId, userId), eq(lessonProgress.completed, true)));
  const [submittedWork] = await db.select({ count: sql<number>`count(*)` }).from(submissions).where(and(eq(submissions.studentId, userId), inArray(submissions.status, ["submitted", "graded", "returned"])));
  const [assignmentFeedback] = await db.select({ count: sql<number>`count(*)` }).from(submissions).where(and(eq(submissions.studentId, userId), sql`${submissions.feedback} is not null`, sql`trim(${submissions.feedback}) <> ''`));
  const [assessmentFeedback] = await db.select({ count: sql<number>`count(*)` }).from(quizAttempts).where(and(eq(quizAttempts.studentId, userId), sql`${quizAttempts.feedback} is not null`, sql`trim(${quizAttempts.feedback}) <> ''`));
  const certificates = await db.select({ id: studentAchievementCertificates.id, milestoneId: studentAchievementCertificates.milestoneId, issuedAt: studentAchievementCertificates.issuedAt, revokedAt: studentAchievementCertificates.revokedAt, revocationReason: studentAchievementCertificates.revocationReason }).from(studentAchievementCertificates).where(eq(studentAchievementCertificates.studentId, userId));
  const metrics = { currentStreak, longestStreak, activeDays: activeDates.size, completedLessons: Number(completedLessons?.count ?? 0), submittedWork: Number(submittedWork?.count ?? 0), feedbackReviewed: Number(assignmentFeedback?.count ?? 0) + Number(assessmentFeedback?.count ?? 0) };
  const milestones = [
    { id: "streak-3", title: "Momentum starter", description: "Learn on three consecutive days.", target: 3, value: metrics.currentStreak, unit: "day streak" },
    { id: "streak-7", title: "Weekly rhythm", description: "Build a seven-day learning streak.", target: 7, value: metrics.longestStreak, unit: "day best" },
    { id: "lessons-10", title: "Lesson builder", description: "Complete ten published lessons.", target: 10, value: metrics.completedLessons, unit: "lessons" },
    { id: "work-5", title: "Reliable submitter", description: "Submit five pieces of course work.", target: 5, value: metrics.submittedWork, unit: "submissions" },
    { id: "feedback-3", title: "Feedback explorer", description: "Revisit three teacher feedback moments.", target: 3, value: metrics.feedbackReviewed, unit: "feedback items" },
  ].map(milestone => ({ ...milestone, unlocked: milestone.value >= milestone.target, progressPercent: Math.min(100, Math.round((milestone.value / milestone.target) * 100)) }));
  return { ...metrics, milestones, certificates, activeToday: activeDates.has(isoDate(new Date())) };
}

async function createAchievementCertificatePdf(input: { studentName: string; milestoneTitle: string; milestoneDescription: string; schoolName?: string | null; issuedAt: Date; verificationUrl: string }) {
  const qrDataUrl = await QRCode.toDataURL(input.verificationUrl, { width: 180, margin: 1, errorCorrectionLevel: "M", color: { dark: "#1e4634", light: "#fbf8ef" } });
  const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", layout: "landscape", margin: 54, info: { Title: `${input.milestoneTitle} achievement certificate`, Author: "Educonnect" } });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.rect(0, 0, document.page.width, document.page.height).fill("#fbf8ef");
    document.lineWidth(10).strokeColor("#d5a94d").rect(22, 22, document.page.width - 44, document.page.height - 44).stroke();
    document.lineWidth(1).strokeColor("#2f7452").rect(38, 38, document.page.width - 76, document.page.height - 76).stroke();
    document.fillColor("#2f7452").font("Helvetica-Bold").fontSize(13).text("EDUCONNECT · ACHIEVEMENT RECORD", 0, 74, { align: "center", characterSpacing: 1.4 });
    document.fillColor("#263530").font("Helvetica-Bold").fontSize(32).text("Certificate of Achievement", 0, 116, { align: "center" });
    document.fillColor("#6d7971").font("Helvetica").fontSize(13).text("This certificate recognizes the verified learning achievement of", 0, 176, { align: "center" });
    document.fillColor("#b06c18").font("Helvetica-Bold").fontSize(29).text(input.studentName, 0, 205, { align: "center" });
    document.fillColor("#263530").font("Helvetica-Bold").fontSize(20).text(input.milestoneTitle, 0, 258, { align: "center" });
    document.fillColor("#6d7971").font("Helvetica").fontSize(12).text(input.milestoneDescription, 96, 294, { align: "center", width: document.page.width - 192 });
    document.fillColor("#6d7971").fontSize(10).text(`Issued ${input.issuedAt.toLocaleDateString()}${input.schoolName ? ` · ${input.schoolName}` : ""}`, 0, 372, { align: "center" });
    document.fillColor("#2f7452").font("Helvetica-Bold").fontSize(11).text("Verified from your Educonnect learning record", 0, 420, { align: "center" });
    document.image(qrBuffer, document.page.width - 128, document.page.height - 128, { width: 76, height: 76 });
    document.fillColor("#6d7971").font("Helvetica").fontSize(7).text("Scan to verify", document.page.width - 140, document.page.height - 46, { width: 100, align: "center" });
    document.end();
  });
}

function anonymizeCertificateRecipient(name?: string | null) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!parts.length) return "Verified Educonnect learner";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function achievementVerificationDetails(milestoneId: string) {
  const details: Record<string, { title: string; description: string }> = {
    "streak-3": { title: "Momentum starter", description: "Learned on three consecutive days." },
    "streak-7": { title: "Weekly rhythm", description: "Built a seven-day learning streak." },
    "lessons-10": { title: "Lesson builder", description: "Completed ten published lessons." },
    "work-5": { title: "Reliable submitter", description: "Submitted five pieces of course work." },
    "feedback-3": { title: "Feedback explorer", description: "Received feedback on three pieces of work." },
  };
  return details[milestoneId] ?? { title: "Verified learning achievement", description: "Completed a verified Educonnect learning milestone." };
}

export async function createStudentAchievementCertificate(userId: number, milestoneId: string, verificationOrigin: string) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") throw new Error("Only students can request their achievement certificates.");
  const engagement = await getStudentEngagementSummary(userId);
  const milestone = engagement.milestones.find(item => item.id === milestoneId);
  if (!milestone || !milestone.unlocked) throw new Error("This achievement is not eligible for a certificate yet.");
  const existing = (await db.select().from(studentAchievementCertificates).where(and(eq(studentAchievementCertificates.studentId, userId), eq(studentAchievementCertificates.milestoneId, milestoneId))).limit(1))[0];
  if (existing?.verificationToken && !existing.revokedAt) return { id: existing.id, milestoneId, issuedAt: existing.issuedAt, verificationToken: existing.verificationToken, ...(await storageGet(existing.storageKey)) };
  const issuedAt = new Date();
  const verificationToken = nanoid(48);
  const verificationUrl = `${verificationOrigin.replace(/\/$/, "")}/verify/certificate/${verificationToken}`;
  const pdf = await createAchievementCertificatePdf({ studentName: profile.user.name || "Educonnect learner", milestoneTitle: milestone.title, milestoneDescription: milestone.description, schoolName: profile.school?.name, issuedAt, verificationUrl });
  const stored = await storagePut(`educonnect/certificates/student-${userId}/${milestoneId}-certificate.pdf`, pdf, "application/pdf");
  if (existing) {
    await db.update(studentAchievementCertificates).set({ storageKey: stored.key, verificationToken, issuedAt, revokedAt: null, revokedBy: null, revocationReason: null }).where(eq(studentAchievementCertificates.id, existing.id));
    await audit(userId, profile.user.schoolId, "student.achievement-certificate.reissued", "studentAchievementCertificate", String(existing.id), { milestoneId });
    return { id: existing.id, milestoneId, issuedAt: existing.issuedAt, verificationToken, ...stored };
  }
  const inserted = await db.insert(studentAchievementCertificates).values({ studentId: userId, milestoneId, storageKey: stored.key, verificationToken, issuedAt });
  const certificateId = Number(inserted[0].insertId);
  await audit(userId, profile.user.schoolId, "student.achievement-certificate.issued", "studentAchievementCertificate", String(certificateId), { milestoneId });
  return { id: certificateId, milestoneId, issuedAt, verificationToken, ...stored };
}

export async function revokeStudentAchievementCertificate(userId: number, milestoneId: string, reason?: string) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") throw new Error("Only students can revoke their own achievement certificates.");
  const certificate = (await db.select().from(studentAchievementCertificates).where(and(eq(studentAchievementCertificates.studentId, userId), eq(studentAchievementCertificates.milestoneId, milestoneId))).limit(1))[0];
  if (!certificate) throw new Error("Achievement certificate not found.");
  if (certificate.revokedAt) return { id: certificate.id, revokedAt: certificate.revokedAt, alreadyRevoked: true as const };
  const revokedAt = new Date();
  await db.update(studentAchievementCertificates).set({ revokedAt, revokedBy: userId, revocationReason: reason?.trim() || null }).where(eq(studentAchievementCertificates.id, certificate.id));
  await audit(userId, profile.user.schoolId, "student.achievement-certificate.revoked", "studentAchievementCertificate", String(certificate.id), { milestoneId, reason: reason?.trim() || undefined });
  return { id: certificate.id, revokedAt, alreadyRevoked: false as const };
}

type CertificateRevocationAuditFilters = { studentSearch?: string; milestoneId?: string; actorRole?: "student" | "administrator"; startAt?: Date; endAt?: Date };

export async function listCertificateRevocationAudit(userId: number, filters?: CertificateRevocationAuditFilters) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can audit certificate revocations.");
  const events = await db.select({ id: auditLogs.id, action: auditLogs.action, certificateId: auditLogs.entityId, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt, actorId: users.id, actorName: users.name, actorEmail: users.email }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorId)).where(and(eq(auditLogs.schoolId, profile.user.schoolId), or(eq(auditLogs.action, "student.achievement-certificate.revoked"), eq(auditLogs.action, "admin.achievement-certificate.revoked")))).orderBy(desc(auditLogs.createdAt)).limit(200);
  return events.map(event => {
    const metadata = event.metadata ?? {};
    return { ...event, milestoneId: typeof metadata.milestoneId === "string" ? metadata.milestoneId : null, studentId: typeof metadata.studentId === "number" ? metadata.studentId : event.action === "student.achievement-certificate.revoked" ? event.actorId : null, reason: typeof metadata.reason === "string" ? metadata.reason : null, actorRole: event.action.startsWith("admin.") ? "administrator" as const : "student" as const };
  }).filter(event => {
    const search = filters?.studentSearch?.trim().toLowerCase();
    const studentMatches = !search || [event.studentId ? String(event.studentId) : "", event.actorName ?? "", event.actorEmail ?? ""].some(value => value.toLowerCase().includes(search));
    const milestoneMatches = !filters?.milestoneId || event.milestoneId === filters.milestoneId;
    const actorMatches = !filters?.actorRole || event.actorRole === filters.actorRole;
    const startMatches = !filters?.startAt || event.createdAt >= filters.startAt;
    const endMatches = !filters?.endAt || event.createdAt <= filters.endAt;
    return studentMatches && milestoneMatches && actorMatches && startMatches && endMatches;
  });
}

export async function createCertificateRevocationAuditExport(userId: number, filters?: CertificateRevocationAuditFilters) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can export certificate revocation audits.");
  const events = await listCertificateRevocationAudit(userId, filters);
  const inserted = await db.insert(reportExports).values({ requestedBy: userId, type: "certificate_revocation", filterSnapshot: { generatedAt: new Date().toISOString(), ...filters }, status: "queued" });
  const exportId = Number(inserted[0].insertId);
  try {
    const rows = [["certificate_revocation_audit"], ["generated_at", new Date().toISOString()], ["student_filter", filters?.studentSearch ?? "all"], ["milestone_filter", filters?.milestoneId ?? "all"], ["actor_filter", filters?.actorRole ?? "all"], ["start_at", filters?.startAt?.toISOString() ?? "all"], ["end_at", filters?.endAt?.toISOString() ?? "all"], [""], ["event_id", "certificate_id", "milestone_id", "student_id", "actor_role", "actor_name", "actor_email", "reason", "revoked_at"], ...events.map(event => [event.id, event.certificateId ?? "", event.milestoneId ?? "", event.studentId ?? "", event.actorRole, event.actorName ?? "", event.actorEmail ?? "", event.reason ?? "", event.createdAt.toISOString()])].map(row => row.map(csvEscape).join(",")).join("\n");
    const stored = await storagePut(`educonnect/exports/school-${profile.user.schoolId}/certificate-revocation-audit-${exportId}.csv`, `\uFEFF${rows}`, "text/csv;charset=utf-8");
    await db.update(reportExports).set({ storageKey: stored.key, status: "ready" }).where(eq(reportExports.id, exportId));
    await audit(userId, profile.user.schoolId, "admin.certificate-revocation-audit.exported", "reportExport", String(exportId), { eventCount: events.length, ...filters });
    return { id: exportId, url: stored.url, eventCount: events.length };
  } catch (error) {
    await db.update(reportExports).set({ status: "failed" }).where(eq(reportExports.id, exportId));
    throw error;
  }
}

export async function revokeCertificateForAdmin(adminId: number, certificateId: number, reason: string) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(adminId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can revoke certificates for governance reasons.");
  const certificate = (await db.select({ certificate: studentAchievementCertificates, schoolId: users.schoolId }).from(studentAchievementCertificates).innerJoin(users, eq(users.id, studentAchievementCertificates.studentId)).where(eq(studentAchievementCertificates.id, certificateId)).limit(1))[0];
  if (!certificate || certificate.schoolId !== profile.user.schoolId) throw new Error("Certificate is not available in this school.");
  if (certificate.certificate.revokedAt) throw new Error("Certificate has already been revoked.");
  const revokedAt = new Date();
  await db.update(studentAchievementCertificates).set({ revokedAt, revokedBy: adminId, revocationReason: reason.trim() }).where(eq(studentAchievementCertificates.id, certificateId));
  await audit(adminId, profile.user.schoolId, "admin.achievement-certificate.revoked", "studentAchievementCertificate", String(certificateId), { milestoneId: certificate.certificate.milestoneId, studentId: certificate.certificate.studentId, reason: reason.trim() });
  return { id: certificateId, revokedAt };
}

export async function verifyStudentAchievementCertificate(verificationToken: string) {
  const db = requireDb(await getDb());
  const row = (await db.select({ certificate: studentAchievementCertificates, studentName: users.name, schoolName: schools.name }).from(studentAchievementCertificates).innerJoin(users, eq(users.id, studentAchievementCertificates.studentId)).leftJoin(schools, eq(schools.id, users.schoolId)).where(eq(studentAchievementCertificates.verificationToken, verificationToken)).limit(1))[0];
  if (!row) return { verified: false as const, status: "not_found" as const };
  if (row.certificate.revokedAt) return { verified: false as const, status: "revoked" as const, revokedAt: row.certificate.revokedAt };
  const achievement = achievementVerificationDetails(row.certificate.milestoneId);
  return { verified: true as const, status: "valid" as const, recipient: anonymizeCertificateRecipient(row.studentName), schoolName: row.schoolName, issuedAt: row.certificate.issuedAt, achievement };
}

export async function getTeacherLearnerAttention(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (!profile.user.schoolId || !["teacher", "admin"].includes(profile.user.role)) throw new Error("Teacher or administrator access is required.");
  const managedCourses = await db.select({ id: courses.id, code: courses.code, title: courses.title }).from(courses).where(and(eq(courses.schoolId, profile.user.schoolId), eq(courses.teacherId, userId)));
  const courseIds = managedCourses.map(course => course.id);
  if (!courseIds.length) return { pendingCount: 0, pendingSubmissions: [], learnersNeedingFollowUp: [] };
  const pendingAll = await db.select({ id: submissions.id, assignmentTitle: assignments.title, courseCode: courses.code, studentName: users.name, studentEmail: users.email, submittedAt: submissions.submittedAt }).from(submissions).innerJoin(assignments, eq(assignments.id, submissions.assignmentId)).innerJoin(courses, eq(courses.id, assignments.courseId)).innerJoin(users, eq(users.id, submissions.studentId)).where(and(inArray(assignments.courseId, courseIds), eq(submissions.status, "submitted"))).orderBy(asc(submissions.submittedAt));
  const enrolled = await db.select({ studentId: users.id, studentName: users.name, studentEmail: users.email, courseId: courses.id, courseCode: courses.code, courseTitle: courses.title }).from(enrollments).innerJoin(courses, eq(courses.id, enrollments.courseId)).innerJoin(users, eq(users.id, enrollments.studentId)).where(and(inArray(enrollments.courseId, courseIds), eq(enrollments.status, "active")));
  const modules = await db.select({ id: courseModules.id, courseId: courseModules.courseId }).from(courseModules).where(inArray(courseModules.courseId, courseIds));
  const moduleIds = modules.map(module => module.id);
  const courseByModule = new Map(modules.map(module => [module.id, module.courseId]));
  const publishedLessons = moduleIds.length ? await db.select({ id: lessons.id, moduleId: lessons.moduleId }).from(lessons).where(and(inArray(lessons.moduleId, moduleIds), eq(lessons.isPublished, true))) : [];
  const totalLessonsByCourse = new Map<number, number>();
  const courseByLesson = new Map<number, number>();
  publishedLessons.forEach(lesson => { const courseId = courseByModule.get(lesson.moduleId); if (!courseId) return; courseByLesson.set(lesson.id, courseId); totalLessonsByCourse.set(courseId, (totalLessonsByCourse.get(courseId) ?? 0) + 1); });
  const studentIds = Array.from(new Set(enrolled.map(row => row.studentId)));
  const completedRows = studentIds.length && publishedLessons.length ? await db.select({ studentId: lessonProgress.studentId, lessonId: lessonProgress.lessonId }).from(lessonProgress).where(and(inArray(lessonProgress.studentId, studentIds), inArray(lessonProgress.lessonId, publishedLessons.map(lesson => lesson.id)), eq(lessonProgress.completed, true))) : [];
  const completedByEnrollment = new Map<string, number>();
  completedRows.forEach(row => { const courseId = courseByLesson.get(row.lessonId); if (!courseId) return; const key = `${row.studentId}:${courseId}`; completedByEnrollment.set(key, (completedByEnrollment.get(key) ?? 0) + 1); });
  const learnersNeedingFollowUp = enrolled.map(row => { const totalLessons = totalLessonsByCourse.get(row.courseId) ?? 0; const completedLessons = completedByEnrollment.get(`${row.studentId}:${row.courseId}`) ?? 0; return { ...row, totalLessons, completedLessons, completionPercent: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0 }; }).filter(row => row.totalLessons > 0 && row.completionPercent < 50).sort((a, b) => a.completionPercent - b.completionPercent).slice(0, 6);
  return { pendingCount: pendingAll.length, pendingSubmissions: pendingAll.slice(0, 6), learnersNeedingFollowUp };
}

export async function getStudentProgress(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user" || !profile.user.schoolId) return [];
  const enrolled = await db.select({ course: courses }).from(enrollments).innerJoin(courses, eq(courses.id, enrollments.courseId)).where(and(eq(enrollments.studentId, userId), eq(enrollments.status, "active")));
  return Promise.all(enrolled.map(async ({ course }) => {
    const modules = await db.select({ id: courseModules.id }).from(courseModules).where(eq(courseModules.courseId, course.id));
    const moduleIds = modules.map(module => module.id);
    const [lessonTotal] = moduleIds.length ? await db.select({ count: sql<number>`count(*)` }).from(lessons).where(and(inArray(lessons.moduleId, moduleIds), eq(lessons.isPublished, true))) : [{ count: 0 }];
    const [completedTotal] = moduleIds.length ? await db.select({ count: sql<number>`count(*)` }).from(lessonProgress).innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId)).where(and(eq(lessonProgress.studentId, userId), eq(lessonProgress.completed, true), inArray(lessons.moduleId, moduleIds))) : [{ count: 0 }];
    const attempts = await db.select({ examId: quizAttempts.examId, score: quizAttempts.score }).from(quizAttempts).innerJoin(exams, eq(exams.id, quizAttempts.examId)).where(and(eq(quizAttempts.studentId, userId), eq(exams.courseId, course.id)));
    const examIds = attempts.map(attempt => attempt.examId);
    const pointTotals = examIds.length ? await db.select({ examId: examQuestions.examId, total: sql<number>`coalesce(sum(${examQuestions.points}), 0)` }).from(examQuestions).where(inArray(examQuestions.examId, examIds)).groupBy(examQuestions.examId) : [];
    const maxPointsByExam = new Map(pointTotals.map(row => [row.examId, Number(row.total ?? 0)]));
    const performancePercent = attempts.length ? Math.round(attempts.reduce((sum, attempt) => {
      const maxPoints = maxPointsByExam.get(attempt.examId) ?? 0;
      return sum + (maxPoints ? (Number(attempt.score ?? 0) / maxPoints) * 100 : 0);
    }, 0) / attempts.length) : 0;
    const total = Number(lessonTotal?.count ?? 0);
    const completed = Number(completedTotal?.count ?? 0);
    return { courseId: course.id, title: course.title, code: course.code, subject: course.subject || "Unclassified", classSection: course.classSection || "Unassigned", completed, total, completionPercent: total ? Math.round((completed / total) * 100) : 0, performancePercent };
  }));
}

export async function getStudentWeeklyTrend(userId: number, weeks = 4) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") return [];
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
  const weekStarts = Array.from({ length: weeks }, (_, index) => new Date(startOfWeek.getTime() - (weeks - 1 - index) * 7 * 86_400_000));
  const from = weekStarts[0];
  const completed = await db.select({ completedAt: lessonProgress.completedAt }).from(lessonProgress).where(and(eq(lessonProgress.studentId, userId), eq(lessonProgress.completed, true), gte(lessonProgress.completedAt, from)));
  const attempts = await db.select({ examId: quizAttempts.examId, score: quizAttempts.score, submittedAt: quizAttempts.submittedAt }).from(quizAttempts).where(and(eq(quizAttempts.studentId, userId), gte(quizAttempts.submittedAt, from)));
  const examIds = Array.from(new Set(attempts.map(attempt => attempt.examId)));
  const pointTotals = examIds.length ? await db.select({ examId: examQuestions.examId, total: sql<number>`coalesce(sum(${examQuestions.points}), 0)` }).from(examQuestions).where(inArray(examQuestions.examId, examIds)).groupBy(examQuestions.examId) : [];
  const maxPointsByExam = new Map(pointTotals.map(row => [row.examId, Number(row.total ?? 0)]));
  return weekStarts.map(weekStart => {
    const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
    const weekCompleted = completed.filter(row => row.completedAt && row.completedAt >= weekStart && row.completedAt < weekEnd).length;
    const weekAttempts = attempts.filter(row => row.submittedAt && row.submittedAt >= weekStart && row.submittedAt < weekEnd);
    const performancePercent = weekAttempts.length ? Math.round(weekAttempts.reduce((sum, attempt) => {
      const maxPoints = maxPointsByExam.get(attempt.examId) ?? 0;
      return sum + (maxPoints ? (Number(attempt.score ?? 0) / maxPoints) * 100 : 0);
    }, 0) / weekAttempts.length) : null;
    return { weekStart, label: weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }), completedLessons: weekCompleted, performancePercent };
  });
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export async function createStudentTrendExport(userId: number, weeks: 4 | 8 | 12) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") throw new Error("Only students can export their learning trends.");
  const trend = await getStudentWeeklyTrend(userId, weeks);
  const courseProgress = await getStudentProgress(userId);
  const assessmentAttempts = await db.select({ score: quizAttempts.score, feedback: quizAttempts.feedback, submittedAt: quizAttempts.submittedAt, assessmentTitle: exams.title, courseCode: courses.code, courseTitle: courses.title, maxPoints: sql<number>`coalesce(sum(${examQuestions.points}), 0)` }).from(quizAttempts).innerJoin(exams, eq(exams.id, quizAttempts.examId)).innerJoin(courses, eq(courses.id, exams.courseId)).leftJoin(examQuestions, eq(examQuestions.examId, exams.id)).where(eq(quizAttempts.studentId, userId)).groupBy(quizAttempts.id, quizAttempts.score, quizAttempts.feedback, quizAttempts.submittedAt, exams.title, courses.code, courses.title);
  const completedAssessments = assessmentAttempts.filter(attempt => attempt.submittedAt);
  const lines = [["weekly_trend"], ["week_start", "week_label", "completed_lessons", "assessment_performance_percent"], ...trend.map(point => [point.weekStart.toISOString().slice(0, 10), point.label, String(point.completedLessons), point.performancePercent === null ? "" : String(point.performancePercent)]), [""], ["course_level_breakdown"], ["course_code", "course_title", "subject", "class_section", "completed_lessons", "total_lessons", "completion_percent", "assessment_performance_percent"], ...courseProgress.map(course => [course.code, course.title, course.subject, course.classSection, String(course.completed), String(course.total), String(course.completionPercent), String(course.performancePercent)]), [""], ["assessment_score_breakdown"], ["course_code", "course_title", "assessment_title", "score", "maximum_points", "percentage", "teacher_feedback", "submitted_at"], ...completedAssessments.map(attempt => { const maxPoints = Number(attempt.maxPoints ?? 0); const score = Number(attempt.score ?? 0); return [attempt.courseCode, attempt.courseTitle, attempt.assessmentTitle, String(score), String(maxPoints), maxPoints ? String(Math.round((score / maxPoints) * 100)) : "", attempt.feedback ?? "", attempt.submittedAt!.toISOString()]; })].map(row => row.map(csvCell).join(","));
  const fileName = `educonnect-weekly-trend-${weeks}-weeks-${new Date().toISOString().slice(0, 10)}.csv`;
  const stored = await storagePut(`trend-exports/${userId}/${nanoid(12)}-${fileName}`, `\uFEFF${lines.join("\n")}`, "text/csv;charset=utf-8");
  const inserted = await db.insert(trendExportDownloads).values({ userId, weekCount: weeks, rowCount: trend.length + courseProgress.length + completedAssessments.length, storageKey: stored.key });
  const id = Number(inserted[0].insertId);
  await audit(userId, profile.user.schoolId, "student-trend.exported", "trendExportDownload", String(id), { weeks, weeklyRows: trend.length, courseRows: courseProgress.length, assessmentRows: completedAssessments.length });
  return { id, fileName, url: stored.url, weekCount: weeks, rowCount: trend.length + courseProgress.length + completedAssessments.length };
}

export async function listStudentTrendExportHistory(userId: number, input: { cursor?: number; weekCount?: 4 | 8 | 12; startAt?: Date; endAt?: Date; includeArchived?: boolean; limit?: number } = {}) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") throw new Error("Only students can review their trend exports.");
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 25);
  const conditions = [eq(trendExportDownloads.userId, userId)];
  if (input.weekCount) conditions.push(eq(trendExportDownloads.weekCount, input.weekCount));
  if (input.startAt) conditions.push(gte(trendExportDownloads.createdAt, input.startAt));
  if (input.endAt) conditions.push(lte(trendExportDownloads.createdAt, input.endAt));
  if (!input.includeArchived) conditions.push(isNull(trendExportDownloads.archivedAt));
  if (input.cursor) conditions.push(lt(trendExportDownloads.id, input.cursor));
  const page = await db.select().from(trendExportDownloads).where(and(...conditions)).orderBy(desc(trendExportDownloads.id)).limit(limit + 1);
  const rows = page.slice(0, limit);
  return { items: rows.map(row => ({ ...row, url: `/manus-storage/${row.storageKey}` })), nextCursor: page.length > limit ? rows.at(-1)?.id ?? null : null };
}

export async function bulkArchiveStudentTrendExports(userId: number, exportIds: number[]) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") throw new Error("Only students can manage their trend exports.");
  await db.update(trendExportDownloads).set({ archivedAt: new Date() }).where(and(eq(trendExportDownloads.userId, userId), inArray(trendExportDownloads.id, exportIds)));
  await audit(userId, profile.user.schoolId, "student-trend.exports-archived", "trendExportDownload", undefined, { exportIds });
}

export async function bulkDeleteStudentTrendExports(userId: number, exportIds: number[]) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") throw new Error("Only students can manage their trend exports.");
  await db.delete(trendExportDownloads).where(and(eq(trendExportDownloads.userId, userId), inArray(trendExportDownloads.id, exportIds)));
  await audit(userId, profile.user.schoolId, "student-trend.exports-deleted", "trendExportDownload", undefined, { exportIds });
}

export async function bulkRestoreStudentTrendExports(userId: number, exportIds: number[]) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") throw new Error("Only students can manage their trend exports.");
  await db.update(trendExportDownloads).set({ archivedAt: null }).where(and(eq(trendExportDownloads.userId, userId), inArray(trendExportDownloads.id, exportIds)));
  await audit(userId, profile.user.schoolId, "student-trend.exports-restored", "trendExportDownload", undefined, { exportIds });
}

type TrendExportRetentionInput = { enabled: boolean; retentionDays: 0 | 7 | 30 | 60 | 90 | 180 };

async function ensureTrendExportRetentionPolicy(userId: number) {
  const db = requireDb(await getDb());
  await db.insert(trendExportRetentionPolicies).values({ userId }).onDuplicateKeyUpdate({ set: { userId } });
  return (await db.select().from(trendExportRetentionPolicies).where(eq(trendExportRetentionPolicies.userId, userId)).limit(1))[0]!;
}

export async function getTrendExportRetentionPolicy(userId: number) {
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") throw new Error("Only students can manage export retention.");
  return ensureTrendExportRetentionPolicy(userId);
}

export async function updateTrendExportRetentionPolicy(userId: number, input: TrendExportRetentionInput, sessionToken: string) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") throw new Error("Only students can manage export retention.");
  const current = await ensureTrendExportRetentionPolicy(userId);
  const scheduleActive = input.enabled && input.retentionDays > 0;
  if (scheduleActive && process.env.NODE_ENV !== "production") throw new Error("Publish the latest Educonnect release before activating daily export retention.");
  let scheduleCronTaskUid = current.scheduleCronTaskUid;
  if (scheduleActive) {
    const job = { cron: "0 0 3 * * *", path: "/api/scheduled/trend-export-retention", payload: {}, description: `Educonnect archived trend export retention for user ${userId}; deletes records archived beyond ${input.retentionDays} days` };
    const schedule = scheduleCronTaskUid ? await updateHeartbeatJob(scheduleCronTaskUid, { ...job, enable: true }, sessionToken) : await createHeartbeatJob({ name: `educonnect-trend-retention-${userId}`, ...job }, sessionToken);
    if (!scheduleCronTaskUid) scheduleCronTaskUid = (schedule as { taskUid: string }).taskUid;
  } else if (scheduleCronTaskUid) {
    await updateHeartbeatJob(scheduleCronTaskUid, { enable: false }, sessionToken);
  }
  await db.update(trendExportRetentionPolicies).set({ enabled: scheduleActive, retentionDays: input.retentionDays, scheduleCronTaskUid }).where(eq(trendExportRetentionPolicies.id, current.id));
  await audit(userId, profile.user.schoolId, "student-trend.retention.updated", "trendExportRetentionPolicy", String(current.id), { enabled: scheduleActive, retentionDays: input.retentionDays });
  return getTrendExportRetentionPolicy(userId);
}

export async function cleanupExpiredTrendExportDownloads(taskUid: string) {
  const db = requireDb(await getDb());
  const policy = (await db.select().from(trendExportRetentionPolicies).where(eq(trendExportRetentionPolicies.scheduleCronTaskUid, taskUid)).limit(1))[0];
  if (!policy) return { ok: true, skipped: "orphan" as const };
  if (!policy.enabled || policy.retentionDays <= 0) return { ok: true, skipped: "disabled" as const };
  const startedAt = new Date();
  const inserted = await db.insert(trendExportRetentionRuns).values({ policyId: policy.id, userId: policy.userId, taskUid, status: "running", startedAt });
  const runId = Number(inserted[0].insertId);
  try {
    const cutoff = new Date(Date.now() - policy.retentionDays * 86_400_000);
    const expired = await db.select({ id: trendExportDownloads.id }).from(trendExportDownloads).where(and(eq(trendExportDownloads.userId, policy.userId), lt(trendExportDownloads.archivedAt, cutoff)));
    if (expired.length) await db.delete(trendExportDownloads).where(and(eq(trendExportDownloads.userId, policy.userId), inArray(trendExportDownloads.id, expired.map(item => item.id))));
    const completedAt = new Date();
    await db.update(trendExportRetentionRuns).set({ status: "completed", deletedCount: expired.length, details: { retentionDays: policy.retentionDays, cutoff: cutoff.toISOString() }, completedAt }).where(eq(trendExportRetentionRuns.id, runId));
    await db.update(trendExportRetentionPolicies).set({ lastCleanedAt: completedAt }).where(eq(trendExportRetentionPolicies.id, policy.id));
    const user = (await db.select().from(users).where(eq(users.id, policy.userId)).limit(1))[0];
    await audit(null, user?.schoolId ?? null, "student-trend.retention.cleaned", "trendExportRetentionPolicy", String(policy.id), { taskUid, deletedCount: expired.length, retentionDays: policy.retentionDays, runId });
    return { ok: true, deletedCount: expired.length, runId };
  } catch (error) {
    await db.update(trendExportRetentionRuns).set({ status: "failed", details: { message: error instanceof Error ? error.message : String(error) }, completedAt: new Date() }).where(eq(trendExportRetentionRuns.id, runId));
    throw error;
  }
}

export async function listStudentTrendExportRetentionRuns(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") throw new Error("Only students can review export cleanup history.");
  return db.select().from(trendExportRetentionRuns).where(eq(trendExportRetentionRuns.userId, userId)).orderBy(desc(trendExportRetentionRuns.startedAt)).limit(30);
}

export async function getStudentAssessmentFeedbackAnalytics(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") return { totalComments: 0, trend: [], recent: [] };
  const rows = await db.select({ feedback: quizAttempts.feedback, submittedAt: quizAttempts.submittedAt, assessmentTitle: exams.title, courseCode: courses.code, courseTitle: courses.title }).from(quizAttempts).innerJoin(exams, eq(exams.id, quizAttempts.examId)).innerJoin(courses, eq(courses.id, exams.courseId)).where(eq(quizAttempts.studentId, userId)).orderBy(desc(quizAttempts.submittedAt)).limit(120);
  const comments = rows.filter(row => row.feedback?.trim() && row.submittedAt);
  const monthStarts = Array.from({ length: 6 }, (_, index) => { const date = new Date(); date.setDate(1); date.setHours(0, 0, 0, 0); date.setMonth(date.getMonth() - (5 - index)); return date; });
  const trend = monthStarts.map(start => { const end = new Date(start); end.setMonth(end.getMonth() + 1); return { label: start.toLocaleDateString("en-US", { month: "short" }), count: comments.filter(row => row.submittedAt! >= start && row.submittedAt! < end).length }; });
  return { totalComments: comments.length, trend, recent: comments.slice(0, 6).map(row => ({ feedback: row.feedback!, submittedAt: row.submittedAt!, assessmentTitle: row.assessmentTitle, courseCode: row.courseCode, courseTitle: row.courseTitle })) };
}

async function collectSchoolSnapshot(schoolId: number) {
  const db = requireDb(await getDb());
  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
  const members = await db.select().from(users).where(eq(users.schoolId, schoolId));
  const memberIds = members.map(member => member.id);
  const schoolCourses = await db.select().from(courses).where(eq(courses.schoolId, schoolId));
  const courseIds = schoolCourses.map(course => course.id);
  const schoolModules = courseIds.length ? await db.select().from(courseModules).where(inArray(courseModules.courseId, courseIds)) : [];
  const moduleIds = schoolModules.map(module => module.id);
  const schoolLessons = moduleIds.length ? await db.select().from(lessons).where(inArray(lessons.moduleId, moduleIds)) : [];
  const schoolAssignments = courseIds.length ? await db.select().from(assignments).where(inArray(assignments.courseId, courseIds)) : [];
  const assignmentIds = schoolAssignments.map(assignment => assignment.id);
  const schoolExams = courseIds.length ? await db.select().from(exams).where(inArray(exams.courseId, courseIds)) : [];
  const examIds = schoolExams.map(exam => exam.id);
  const schoolConversations = await db.select().from(conversations).where(eq(conversations.schoolId, schoolId));
  const conversationIds = schoolConversations.map(conversation => conversation.id);
  return {
    generatedAt: new Date().toISOString(),
    school,
    members,
    courses: schoolCourses,
    modules: schoolModules,
    lessons: schoolLessons,
    enrollments: courseIds.length ? await db.select().from(enrollments).where(inArray(enrollments.courseId, courseIds)) : [],
    lessonProgress: memberIds.length ? await db.select().from(lessonProgress).where(inArray(lessonProgress.studentId, memberIds)) : [],
    assignments: schoolAssignments,
    submissions: assignmentIds.length ? await db.select().from(submissions).where(inArray(submissions.assignmentId, assignmentIds)) : [],
    exams: schoolExams,
    examQuestions: examIds.length ? await db.select().from(examQuestions).where(inArray(examQuestions.examId, examIds)) : [],
    quizAttempts: examIds.length ? await db.select().from(quizAttempts).where(inArray(quizAttempts.examId, examIds)) : [],
    schedule: await db.select().from(scheduleEvents).where(eq(scheduleEvents.schoolId, schoolId)),
    conversations: schoolConversations,
    conversationParticipants: conversationIds.length ? await db.select().from(conversationParticipants).where(inArray(conversationParticipants.conversationId, conversationIds)) : [],
    messages: conversationIds.length ? await db.select().from(messages).where(inArray(messages.conversationId, conversationIds)) : [],
    notifications: memberIds.length ? await db.select().from(notifications).where(inArray(notifications.recipientId, memberIds)) : [],
    auditLogs: await db.select().from(auditLogs).where(eq(auditLogs.schoolId, schoolId)),
    invites: await db.select().from(schoolInvites).where(eq(schoolInvites.schoolId, schoolId)),
    aiRuns: memberIds.length ? await db.select().from(aiRuns).where(inArray(aiRuns.requestedBy, memberIds)) : [],
  };
}

function csvEscape(value: unknown) {
  const text = value == null ? "" : typeof value === "string" ? value : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function createBackupJob(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can request a backup.");
  const inserted = await db.insert(backupJobs).values({ requestedBy: userId, status: "queued" });
  const jobId = Number(inserted[0].insertId);
  await db.update(backupJobs).set({ status: "running", startedAt: new Date() }).where(eq(backupJobs.id, jobId));
  try {
    const snapshot = await collectSchoolSnapshot(profile.user.schoolId);
    const stored = await storagePut(`educonnect/backups/school-${profile.user.schoolId}/backup-${jobId}.json`, JSON.stringify(snapshot, null, 2), "application/json");
    await db.update(backupJobs).set({ status: "completed", storageKey: stored.key, completedAt: new Date() }).where(eq(backupJobs.id, jobId));
    await audit(userId, profile.user.schoolId, "backup.completed", "backupJob", String(jobId), { storageKey: stored.key });
    return { id: jobId, status: "completed" as const, url: stored.url };
  } catch (error) {
    await db.update(backupJobs).set({ status: "failed", errorMessage: error instanceof Error ? error.message.slice(0, 4000) : "Backup generation failed." }).where(eq(backupJobs.id, jobId));
    await audit(userId, profile.user.schoolId, "backup.failed", "backupJob", String(jobId));
    throw error;
  }
}

export async function listBackupJobs(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can review backup jobs.");
  const rows = await db.select().from(backupJobs).where(inArray(backupJobs.requestedBy, (await db.select({ id: users.id }).from(users).where(eq(users.schoolId, profile.user.schoolId))).map(member => member.id))).orderBy(desc(backupJobs.createdAt)).limit(30);
  return rows.map(row => ({ ...row, url: row.storageKey ? `/manus-storage/${row.storageKey}` : null }));
}

export async function requestReportExport(userId: number, type: "course" | "user" | "performance" | "system", filterSnapshot: Record<string, unknown>) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can request report exports.");
  const inserted = await db.insert(reportExports).values({ requestedBy: userId, type, filterSnapshot, status: "queued" });
  const exportId = Number(inserted[0].insertId);
  await db.update(reportExports).set({ status: "running" as "queued" | "ready" | "failed" }).where(eq(reportExports.id, exportId));
  try {
    const snapshot = await collectSchoolSnapshot(profile.user.schoolId);
    const json = type === "system" ? JSON.stringify(snapshot, null, 2) : type === "user" ? ["id,name,email,role", ...snapshot.members.map(member => [member.id, member.name, member.email, member.role].map(csvEscape).join(","))].join("\n") : type === "course" ? ["code,title,status,teacherId", ...snapshot.courses.map(course => [course.code, course.title, course.status, course.teacherId].map(csvEscape).join(","))].join("\n") : ["studentId,completedLessons,submittedAssignments", ...snapshot.members.filter(member => member.role === "user").map(member => [member.id, snapshot.lessonProgress.filter(progress => progress.studentId === member.id && progress.completed).length, snapshot.submissions.filter(submission => submission.studentId === member.id).length].map(csvEscape).join(","))].join("\n");
    const extension = type === "system" ? "json" : "csv";
    const stored = await storagePut(`educonnect/exports/school-${profile.user.schoolId}/${type}-export-${exportId}.${extension}`, json, extension === "json" ? "application/json" : "text/csv");
    await db.update(reportExports).set({ status: "ready", storageKey: stored.key }).where(eq(reportExports.id, exportId));
    await audit(userId, profile.user.schoolId, "report.export.ready", "reportExport", String(exportId), { type, storageKey: stored.key });
    return { id: exportId, status: "ready" as const, url: stored.url };
  } catch (error) {
    await db.update(reportExports).set({ status: "failed" }).where(eq(reportExports.id, exportId));
    await audit(userId, profile.user.schoolId, "report.export.failed", "reportExport", String(exportId), { type });
    throw error;
  }
}

export async function listReportExports(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can review report exports.");
  const memberIds = (await db.select({ id: users.id }).from(users).where(eq(users.schoolId, profile.user.schoolId))).map(member => member.id);
  const rows = memberIds.length ? await db.select().from(reportExports).where(inArray(reportExports.requestedBy, memberIds)).orderBy(desc(reportExports.createdAt)).limit(30) : [];
  return rows.map(row => ({ ...row, url: row.storageKey ? `/manus-storage/${row.storageKey}` : null }));
}

export async function listAuditLogs(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin") throw new Error("Only administrators can read audit logs.");
  return db.select().from(auditLogs).where(eq(auditLogs.schoolId, profile.user.schoolId!)).orderBy(desc(auditLogs.createdAt)).limit(50);
}

export async function listRecentActivities(userId: number, filters?: { courseId?: number; subject?: string; classSection?: string; startAt?: Date; endAt?: Date }) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (!profile.user.schoolId) return [];
  const conditions = [eq(auditLogs.schoolId, profile.user.schoolId), eq(auditLogs.actorId, userId)];
  if (filters?.startAt) conditions.push(gte(auditLogs.createdAt, filters.startAt));
  if (filters?.endAt) conditions.push(lte(auditLogs.createdAt, filters.endAt));
  const rows = await db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt)).limit(80);
  if (profile.user.role !== "teacher") return rows.slice(0, 8).map(row => ({ ...row, course: null }));
  const teacherCourses = await db.select().from(courses).where(and(eq(courses.schoolId, profile.user.schoolId), eq(courses.teacherId, userId)));
  const courseById = new Map(teacherCourses.map(course => [course.id, course]));
  return rows.map(row => {
    const meta = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
    const fromMetadata = Number(meta.courseId);
    const courseId = Number.isFinite(fromMetadata) && fromMetadata > 0 ? fromMetadata : row.entityType === "course" ? Number(row.entityId) : null;
    return { ...row, course: courseId ? courseById.get(courseId) ?? null : null };
  }).filter(row => {
    if (filters?.courseId && row.course?.id !== filters.courseId) return false;
    if (filters?.subject && (row.course?.subject || "Unclassified") !== filters.subject) return false;
    if (filters?.classSection && (row.course?.classSection || "Unassigned") !== filters.classSection) return false;
    return true;
  }).slice(0, 8);
}

type ActivityFilterPresetInput = { name: string; courseId?: number; subject?: string; classSection?: string; startDate?: string; endDate?: string; tags?: string[] };

function normalizeTemplateTags(tags?: string[]) {
  return Array.from(new Set((tags ?? []).map(tag => tag.trim().replace(/\s+/g, " ")).filter(Boolean))).slice(0, 8);
}

async function requireTeacherPresetOwner(userId: number) {
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "teacher" || !profile.user.schoolId) throw new Error("Only teachers can manage activity filter presets.");
  return profile;
}

export async function listActivityFilterPresets(userId: number) {
  const db = requireDb(await getDb());
  await requireTeacherPresetOwner(userId);
  return db.select().from(activityFilterPresets).where(eq(activityFilterPresets.userId, userId)).orderBy(asc(activityFilterPresets.name));
}

export async function saveActivityFilterPreset(userId: number, input: ActivityFilterPresetInput) {
  const db = requireDb(await getDb());
  const profile = await requireTeacherPresetOwner(userId);
  if (input.courseId) {
    const course = (await db.select({ id: courses.id }).from(courses).where(and(eq(courses.id, input.courseId), eq(courses.schoolId, profile.user.schoolId!), eq(courses.teacherId, userId))).limit(1))[0];
    if (!course) throw new Error("You can only save filters for your own courses.");
  }
  const values = { userId, schoolId: profile.user.schoolId!, name: input.name.trim(), courseId: input.courseId ?? null, subject: input.subject ?? null, classSection: input.classSection ?? null, startDate: input.startDate ?? null, endDate: input.endDate ?? null, tags: normalizeTemplateTags(input.tags) };
  await db.insert(activityFilterPresets).values(values).onDuplicateKeyUpdate({ set: { courseId: values.courseId, subject: values.subject, classSection: values.classSection, startDate: values.startDate, endDate: values.endDate, tags: values.tags, updatedAt: new Date() } });
  await audit(userId, profile.user.schoolId, "activity-filter-preset.saved", "activityFilterPreset", input.name.trim());
}

async function getOwnedActivityFilterPreset(userId: number, presetId: number) {
  const db = requireDb(await getDb());
  const preset = (await db.select().from(activityFilterPresets).where(and(eq(activityFilterPresets.id, presetId), eq(activityFilterPresets.userId, userId))).limit(1))[0];
  if (!preset) throw new Error("That activity filter preset was not found.");
  return preset;
}

export async function setDefaultActivityFilterPreset(userId: number, presetId: number) {
  const db = requireDb(await getDb());
  const profile = await requireTeacherPresetOwner(userId);
  await getOwnedActivityFilterPreset(userId, presetId);
  await db.update(activityFilterPresets).set({ isDefault: false }).where(eq(activityFilterPresets.userId, userId));
  await db.update(activityFilterPresets).set({ isDefault: true }).where(and(eq(activityFilterPresets.id, presetId), eq(activityFilterPresets.userId, userId)));
  await audit(userId, profile.user.schoolId, "activity-filter-preset.defaulted", "activityFilterPreset", String(presetId));
}

export async function resetDefaultActivityFilterPreset(userId: number) {
  const db = requireDb(await getDb());
  const profile = await requireTeacherPresetOwner(userId);
  await db.update(activityFilterPresets).set({ isDefault: false }).where(eq(activityFilterPresets.userId, userId));
  await audit(userId, profile.user.schoolId, "activity-filter-preset.default-reset", "activityFilterPreset");
}

export async function setActivityFilterPresetShared(userId: number, presetId: number, isShared: boolean) {
  const db = requireDb(await getDb());
  const profile = await requireTeacherPresetOwner(userId);
  await getOwnedActivityFilterPreset(userId, presetId);
  await db.update(activityFilterPresets).set({ isShared }).where(and(eq(activityFilterPresets.id, presetId), eq(activityFilterPresets.userId, userId)));
  await audit(userId, profile.user.schoolId, isShared ? "activity-filter-preset.shared" : "activity-filter-preset.revoked", "activityFilterPreset", String(presetId));
}

export async function listSharedActivityFilterPresetTemplates(userId: number) {
  const db = requireDb(await getDb());
  const profile = await requireTeacherPresetOwner(userId);
  const rows = await db.select({ preset: activityFilterPresets, author: users, favorite: activityFilterPresetFavorites, folder: activityFilterPresetFavoriteFolders }).from(activityFilterPresets).innerJoin(users, eq(users.id, activityFilterPresets.userId)).leftJoin(activityFilterPresetFavorites, and(eq(activityFilterPresetFavorites.presetId, activityFilterPresets.id), eq(activityFilterPresetFavorites.userId, userId))).leftJoin(activityFilterPresetFavoriteFolders, eq(activityFilterPresetFavoriteFolders.id, activityFilterPresetFavorites.folderId)).where(and(eq(activityFilterPresets.schoolId, profile.user.schoolId!), eq(activityFilterPresets.isShared, true))).orderBy(asc(activityFilterPresets.name));
  return rows.map(({ preset, author, favorite, folder }) => ({ ...preset, authorName: author.name || "A teacher", isFavorite: Boolean(favorite?.id), favoriteFolderId: favorite?.folderId ?? null, favoriteFolderColor: folder?.color ?? null }));
}

export async function listActivityFilterPresetFavoriteFolders(userId: number) {
  const db = requireDb(await getDb());
  await requireTeacherPresetOwner(userId);
  return db.select().from(activityFilterPresetFavoriteFolders).where(eq(activityFilterPresetFavoriteFolders.userId, userId)).orderBy(asc(activityFilterPresetFavoriteFolders.position), asc(activityFilterPresetFavoriteFolders.name));
}

export async function createActivityFilterPresetFavoriteFolder(userId: number, name: string, color = "#52749a") {
  const db = requireDb(await getDb());
  const profile = await requireTeacherPresetOwner(userId);
  const currentFolders = await db.select({ position: activityFilterPresetFavoriteFolders.position }).from(activityFilterPresetFavoriteFolders).where(eq(activityFilterPresetFavoriteFolders.userId, userId));
  const values = { userId, name: name.trim(), color, position: currentFolders.reduce((max, folder) => Math.max(max, folder.position), -1) + 1 };
  await db.insert(activityFilterPresetFavoriteFolders).values(values).onDuplicateKeyUpdate({ set: { name: values.name, color: values.color, updatedAt: new Date() } });
  await audit(userId, profile.user.schoolId, "activity-filter-favorite-folder.saved", "activityFilterPresetFavoriteFolder", values.name);
}

export async function setActivityFilterPresetFavoriteFolderColor(userId: number, folderId: number, color: string) {
  const db = requireDb(await getDb());
  const profile = await requireTeacherPresetOwner(userId);
  const result = await db.update(activityFilterPresetFavoriteFolders).set({ color }).where(and(eq(activityFilterPresetFavoriteFolders.id, folderId), eq(activityFilterPresetFavoriteFolders.userId, userId)));
  if (!result[0].affectedRows) throw new Error("That favorite folder was not found.");
  await audit(userId, profile.user.schoolId, "activity-filter-favorite-folder.color-updated", "activityFilterPresetFavoriteFolder", String(folderId), { color });
}

export async function reorderActivityFilterPresetFavoriteFolders(userId: number, folderIds: number[]) {
  const db = requireDb(await getDb());
  const profile = await requireTeacherPresetOwner(userId);
  const owned = await db.select({ id: activityFilterPresetFavoriteFolders.id }).from(activityFilterPresetFavoriteFolders).where(eq(activityFilterPresetFavoriteFolders.userId, userId));
  const ownedIds = new Set(owned.map(folder => folder.id));
  if (folderIds.some(folderId => !ownedIds.has(folderId))) throw new Error("You can only reorder your own favorite folders.");
  await Promise.all(folderIds.map((folderId, position) => db.update(activityFilterPresetFavoriteFolders).set({ position }).where(and(eq(activityFilterPresetFavoriteFolders.id, folderId), eq(activityFilterPresetFavoriteFolders.userId, userId)))));
  await audit(userId, profile.user.schoolId, "activity-filter-favorite-folder.reordered", "activityFilterPresetFavoriteFolder", undefined, { folderIds });
}

export async function deleteActivityFilterPresetFavoriteFolder(userId: number, folderId: number) {
  const db = requireDb(await getDb());
  const profile = await requireTeacherPresetOwner(userId);
  const folder = (await db.select({ id: activityFilterPresetFavoriteFolders.id }).from(activityFilterPresetFavoriteFolders).where(and(eq(activityFilterPresetFavoriteFolders.id, folderId), eq(activityFilterPresetFavoriteFolders.userId, userId))).limit(1))[0];
  if (!folder) throw new Error("That favorite folder was not found.");
  await db.update(activityFilterPresetFavorites).set({ folderId: null }).where(and(eq(activityFilterPresetFavorites.userId, userId), eq(activityFilterPresetFavorites.folderId, folderId)));
  await db.delete(activityFilterPresetFavoriteFolders).where(and(eq(activityFilterPresetFavoriteFolders.id, folderId), eq(activityFilterPresetFavoriteFolders.userId, userId)));
  await audit(userId, profile.user.schoolId, "activity-filter-favorite-folder.deleted", "activityFilterPresetFavoriteFolder", String(folderId));
}

export async function setActivityFilterPresetFavorite(userId: number, presetId: number, isFavorite: boolean) {
  const db = requireDb(await getDb());
  const profile = await requireTeacherPresetOwner(userId);
  const template = (await db.select({ id: activityFilterPresets.id }).from(activityFilterPresets).where(and(eq(activityFilterPresets.id, presetId), eq(activityFilterPresets.schoolId, profile.user.schoolId!), eq(activityFilterPresets.isShared, true))).limit(1))[0];
  if (!template) throw new Error("That shared school template is not available to favorite.");
  if (isFavorite) await db.insert(activityFilterPresetFavorites).values({ userId, presetId }).onDuplicateKeyUpdate({ set: { createdAt: new Date() } });
  else await db.delete(activityFilterPresetFavorites).where(and(eq(activityFilterPresetFavorites.userId, userId), eq(activityFilterPresetFavorites.presetId, presetId)));
  await audit(userId, profile.user.schoolId, isFavorite ? "activity-filter-preset.favorited" : "activity-filter-preset.unfavorited", "activityFilterPreset", String(presetId));
}

export async function assignActivityFilterPresetFavoriteFolder(userId: number, presetId: number, folderId?: number) {
  const db = requireDb(await getDb());
  const profile = await requireTeacherPresetOwner(userId);
  const favorite = (await db.select({ id: activityFilterPresetFavorites.id }).from(activityFilterPresetFavorites).where(and(eq(activityFilterPresetFavorites.userId, userId), eq(activityFilterPresetFavorites.presetId, presetId))).limit(1))[0];
  if (!favorite) throw new Error("Favorite the shared template before placing it in a folder.");
  if (folderId) {
    const folder = (await db.select({ id: activityFilterPresetFavoriteFolders.id }).from(activityFilterPresetFavoriteFolders).where(and(eq(activityFilterPresetFavoriteFolders.id, folderId), eq(activityFilterPresetFavoriteFolders.userId, userId))).limit(1))[0];
    if (!folder) throw new Error("That favorite folder was not found.");
  }
  await db.update(activityFilterPresetFavorites).set({ folderId: folderId ?? null }).where(and(eq(activityFilterPresetFavorites.userId, userId), eq(activityFilterPresetFavorites.presetId, presetId)));
  await audit(userId, profile.user.schoolId, "activity-filter-preset.favorite-folder-assigned", "activityFilterPreset", String(presetId), { folderId: folderId ?? null });
}

export async function copySharedActivityFilterPresetTemplate(userId: number, templateId: number, name: string) {
  const db = requireDb(await getDb());
  const profile = await requireTeacherPresetOwner(userId);
  const template = (await db.select().from(activityFilterPresets).where(and(eq(activityFilterPresets.id, templateId), eq(activityFilterPresets.schoolId, profile.user.schoolId!), eq(activityFilterPresets.isShared, true))).limit(1))[0];
  if (!template) throw new Error("That shared school template is no longer available.");
  const values = { userId, schoolId: profile.user.schoolId!, name: name.trim(), courseId: null, subject: template.subject, classSection: template.classSection, startDate: template.startDate, endDate: template.endDate, tags: template.tags, isDefault: false, isShared: false };
  await db.insert(activityFilterPresets).values(values).onDuplicateKeyUpdate({ set: { courseId: null, subject: values.subject, classSection: values.classSection, startDate: values.startDate, endDate: values.endDate, tags: values.tags, updatedAt: new Date() } });
  await audit(userId, profile.user.schoolId, "activity-filter-preset.template-copied", "activityFilterPreset", String(templateId), { templateId });
}

export async function deleteActivityFilterPreset(userId: number, presetId: number) {
  const db = requireDb(await getDb());
  const profile = await requireTeacherPresetOwner(userId);
  await db.delete(activityFilterPresets).where(and(eq(activityFilterPresets.id, presetId), eq(activityFilterPresets.userId, userId)));
  await audit(userId, profile.user.schoolId, "activity-filter-preset.deleted", "activityFilterPreset", String(presetId));
}

export async function createAiRun(userId: number, feature: "study_plan" | "feedback_draft" | "career_guidance", inputSummary: string) {
  const db = requireDb(await getDb());
  const inserted = await db.insert(aiRuns).values({ requestedBy: userId, feature, promptVersion: "educonnect-v1", inputSummary, reviewStatus: "pending" });
  const id = Number(inserted[0].insertId);
  const profile = await getWorkspace(userId);
  await audit(userId, profile.user.schoolId, "ai.requested", "aiRun", String(id), { feature, promptVersion: "educonnect-v1" });
  return { id, status: "pending_review" as const, message: "Your AI request has been recorded for review. No automated high-impact recommendation is issued without a human review step." };
}

export async function generateStudyPlan(userId: number, learningContext: string) {
  const profile = await getWorkspace(userId);
  const catalog = await listLLMModels();
  const model = catalog.data.find(item => item.id === "gpt-5-mini")?.id ?? catalog.data.find(item => item.id.startsWith("gpt-"))?.id;
  if (!model) throw new Error("No compatible study-planning model is currently available.");
  const response = await invokeLLM({
    model,
    maxTokens: 900,
    messages: [
      { role: "system", content: "You are Educonnect's low-risk study-planning assistant. Create optional, practical learning suggestions only. Do not diagnose, grade, rank, decide eligibility, infer personal traits, make safety claims, or provide professional advice. Do not claim access to information not provided. Keep the plan encouraging and editable by a teacher." },
      { role: "user", content: `Create a short study plan from this learner-provided context:\n${learningContext}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "study_plan",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            next_steps: { type: "array", items: { type: "string" } },
            reflection_question: { type: "string" },
            boundary_note: { type: "string" },
          },
          required: ["summary", "next_steps", "reflection_question", "boundary_note"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = response.choices[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("The study-plan assistant returned no usable response.");
  let plan: { summary: string; next_steps: string[]; reflection_question: string; boundary_note: string };
  try { plan = JSON.parse(content); } catch { throw new Error("The study-plan assistant returned an invalid structured response."); }
  const db = requireDb(await getDb());
  const inserted = await db.insert(aiRuns).values({ requestedBy: userId, feature: "study_plan", promptVersion: "study-plan-v1", inputSummary: learningContext, outputSummary: JSON.stringify(plan), reviewStatus: "pending" });
  const id = Number(inserted[0].insertId);
  await audit(userId, profile.user.schoolId, "ai.study_plan.generated", "aiRun", String(id), { model, promptVersion: "study-plan-v1", reviewStatus: "pending" });
  return { id, status: "pending_review" as const, disclaimer: "Your optional study-plan draft has been queued for human review. It will not be shown until a reviewer accepts it." };
}

export async function listMyAcceptedAiRuns(userId: number) {
  const db = requireDb(await getDb());
  return db.select().from(aiRuns).where(and(eq(aiRuns.requestedBy, userId), eq(aiRuns.reviewStatus, "accepted"))).orderBy(desc(aiRuns.createdAt)).limit(10);
}

export async function listPendingAiRuns(actorId: number) {
  const db = requireDb(await getDb());
  const actor = await getWorkspace(actorId);
  if (actor.user.role !== "admin" || !actor.user.schoolId) throw new Error("Only administrators can review AI requests.");
  return db.select({ run: aiRuns, requester: users }).from(aiRuns).innerJoin(users, eq(users.id, aiRuns.requestedBy)).where(and(eq(users.schoolId, actor.user.schoolId), eq(aiRuns.reviewStatus, "pending"))).orderBy(asc(aiRuns.createdAt));
}

export async function reviewAiRun(actorId: number, runId: number, decision: "accepted" | "rejected") {
  const db = requireDb(await getDb());
  const actor = await getWorkspace(actorId);
  if (actor.user.role !== "admin" || !actor.user.schoolId) throw new Error("Only administrators can review AI requests.");
  const record = (await db.select({ run: aiRuns, requester: users }).from(aiRuns).innerJoin(users, eq(users.id, aiRuns.requestedBy)).where(and(eq(aiRuns.id, runId), eq(users.schoolId, actor.user.schoolId))).limit(1))[0];
  if (!record) throw new Error("AI request was not found in the active school.");
  await db.update(aiRuns).set({ reviewStatus: decision }).where(eq(aiRuns.id, runId));
  await audit(actorId, actor.user.schoolId, `ai.review.${decision}`, "aiRun", String(runId), { requestedBy: record.run.requestedBy });
  return { id: runId, reviewStatus: decision };
}

export async function createConversation(actorId: number, input: { subject: string; participantIds: number[] }) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(actorId);
  if (!profile.user.schoolId) throw new Error("Complete school setup before creating a conversation.");
  const members = await db.select({ id: users.id }).from(users).where(eq(users.schoolId, profile.user.schoolId));
  const memberIds = new Set(members.map(member => member.id));
  const participantIds = Array.from(new Set([actorId, ...input.participantIds]));
  if (participantIds.some(id => !memberIds.has(id))) throw new Error("Every participant must belong to the active school.");
  const inserted = await db.insert(conversations).values({ schoolId: profile.user.schoolId, subject: input.subject, createdBy: actorId });
  const conversationId = Number(inserted[0].insertId);
  await db.insert(conversationParticipants).values(participantIds.map(userId => ({ conversationId, userId })));
  await audit(actorId, profile.user.schoolId, "conversation.created", "conversation", String(conversationId), { participantCount: participantIds.length });
  return conversationId;
}

export async function listConversations(userId: number) {
  const db = requireDb(await getDb());
  return db.select({ conversation: conversations, participant: conversationParticipants }).from(conversationParticipants).innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId)).where(eq(conversationParticipants.userId, userId)).orderBy(desc(conversations.createdAt));
}

export async function listMessages(userId: number, conversationId: number) {
  const db = requireDb(await getDb());
  const membership = (await db.select().from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId))).limit(1))[0];
  if (!membership) throw new Error("You are not a participant in this conversation.");
  return db.select({ message: messages, sender: users }).from(messages).innerJoin(users, eq(users.id, messages.senderId)).where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.createdAt));
}

export async function sendMessage(userId: number, conversationId: number, body: string) {
  const db = requireDb(await getDb());
  const membership = (await db.select().from(conversationParticipants).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId))).limit(1))[0];
  if (!membership) throw new Error("You are not a participant in this conversation.");
  const inserted = await db.insert(messages).values({ conversationId, senderId: userId, body });
  await db.update(conversationParticipants).set({ lastReadAt: new Date() }).where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)));
  const profile = await getWorkspace(userId);
  await audit(userId, profile.user.schoolId, "message.sent", "conversation", String(conversationId));
  return Number(inserted[0].insertId);
}

export async function listNotifications(userId: number) {
  const db = requireDb(await getDb());
  return db.select().from(notifications).where(eq(notifications.recipientId, userId)).orderBy(desc(notifications.createdAt)).limit(30);
}

export async function getNotificationInbox(userId: number) {
  const db = requireDb(await getDb());
  const [unread] = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.recipientId, userId), isNull(notifications.readAt)));
  const latest = await db.select().from(notifications).where(eq(notifications.recipientId, userId)).orderBy(desc(notifications.createdAt)).limit(6);
  return { unreadCount: Number(unread?.count ?? 0), latest };
}

async function ensureNotificationPreferences(userId: number) {
  const db = requireDb(await getDb());
  const existing = (await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1))[0];
  if (existing) return existing;
  await db.insert(notificationPreferences).values({ userId });
  return (await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1))[0]!;
}

export async function getNotificationPreferences(userId: number) {
  return ensureNotificationPreferences(userId);
}

type NotificationPreferenceInput = {
  staffUpdatesEnabled: boolean;
  gradeUpdatesEnabled: boolean;
  assessmentUpdatesEnabled: boolean;
  learningRemindersEnabled: boolean;
  emailDeliveryEnabled: boolean;
  pushDeliveryEnabled: boolean;
  reminderEnabled: boolean;
  reminderTimeUtc: string;
  reminderTimezone: string;
  reminderWeekdaysOnly: boolean;
};

function assertReminderTime(time: string) {
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error("Reminder time must use a valid 24-hour HH:MM format.");
  if (minute % 15 !== 0) throw new Error("Choose a reminder time in 15-minute increments.");
}

function assertReminderTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new Error("Choose a valid IANA timezone.");
  }
}

function isReminderDueInLocalTime(time: string, timezone: string, weekdaysOnly: boolean, now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value;
  const localTime = `${part("hour")}:${part("minute")}`;
  const weekday = part("weekday");
  return localTime === time && (!weekdaysOnly || !["Sat", "Sun"].includes(weekday ?? ""));
}

export async function updateNotificationPreferences(userId: number, input: NotificationPreferenceInput, sessionToken: string) {
  const db = requireDb(await getDb());
  const current = await ensureNotificationPreferences(userId);
  const scheduleActive = input.learningRemindersEnabled && input.reminderEnabled;
  assertReminderTime(input.reminderTimeUtc);
  assertReminderTimezone(input.reminderTimezone);
  if (scheduleActive && process.env.NODE_ENV !== "production") throw new Error("Publish the latest Educonnect release before activating scheduled reminders.");
  let reminderScheduleCronTaskUid = current.reminderScheduleCronTaskUid;
  let reminderNextExecutionAt: Date | null = null;
  if (scheduleActive) {
    const job = { cron: "0 */15 * * * *", path: "/api/scheduled/learning-reminder", payload: {}, description: `Educonnect in-app learning reminder for user ${userId}; callback checks ${input.reminderTimeUtc} in ${input.reminderTimezone}` };
    const schedule = reminderScheduleCronTaskUid
      ? await updateHeartbeatJob(reminderScheduleCronTaskUid, { ...job, enable: true }, sessionToken)
      : await createHeartbeatJob({ name: `educonnect-learning-reminder-${userId}`, ...job }, sessionToken);
    if (!reminderScheduleCronTaskUid) reminderScheduleCronTaskUid = (schedule as { taskUid: string }).taskUid;
    const nextExecutionAt = (schedule as { nextExecutionAt?: string | null }).nextExecutionAt;
    reminderNextExecutionAt = nextExecutionAt ? new Date(nextExecutionAt) : null;
  } else if (reminderScheduleCronTaskUid) {
    await updateHeartbeatJob(reminderScheduleCronTaskUid, { enable: false }, sessionToken);
  }
  await db.update(notificationPreferences).set({ ...input, reminderEnabled: scheduleActive, reminderScheduleCronTaskUid, reminderNextExecutionAt }).where(eq(notificationPreferences.userId, userId));
  const profile = await getWorkspace(userId);
  await audit(userId, profile.user.schoolId, "notification.preferences.updated", "notificationPreferences", String(userId), { reminderEnabled: scheduleActive, reminderTimezone: input.reminderTimezone, emailDeliveryEnabled: input.emailDeliveryEnabled, pushDeliveryEnabled: input.pushDeliveryEnabled });
  return getNotificationPreferences(userId);
}

export async function deliverScheduledLearningReminder(taskUid: string) {
  const db = requireDb(await getDb());
  const preferences = (await db.select().from(notificationPreferences).where(eq(notificationPreferences.reminderScheduleCronTaskUid, taskUid)).limit(1))[0];
  if (!preferences) return { ok: true, skipped: "orphan" as const };
  if (!preferences.learningRemindersEnabled || !preferences.reminderEnabled) return { ok: true, skipped: "disabled" as const };
  const user = (await db.select().from(users).where(eq(users.id, preferences.userId)).limit(1))[0];
  if (!user || user.role !== "user") return { ok: true, skipped: "not-student" as const };
  const now = new Date();
  if (!isReminderDueInLocalTime(preferences.reminderTimeUtc, preferences.reminderTimezone, preferences.reminderWeekdaysOnly, now)) return { ok: true, skipped: "not-due" as const };
  const [activeCourses] = await db.select({ count: sql<number>`count(*)` }).from(enrollments).where(and(eq(enrollments.studentId, user.id), eq(enrollments.status, "active")));
  const courseCount = Number(activeCourses?.count ?? 0);
  if (!courseCount) return { ok: true, skipped: "no-active-courses" as const };
  const utcDayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (preferences.reminderLastSentAt && preferences.reminderLastSentAt >= utcDayStart) return { ok: true, skipped: "already-sent" as const };
  await db.insert(notifications).values({ recipientId: user.id, title: "Scheduled learning reminder", body: `You have ${courseCount} active ${courseCount === 1 ? "course" : "courses"}. Set aside a few minutes to continue your learning today.`, href: "/app#courses" });
  await db.update(notificationPreferences).set({ reminderLastSentAt: now }).where(eq(notificationPreferences.id, preferences.id));
  await audit(null, user.schoolId, "notification.reminder.delivered", "notificationPreferences", String(preferences.id), { userId: user.id, courseCount, taskUid });
  return { ok: true, delivered: true };
}

export async function listSentNotifications(actorId: number) {
  const db = requireDb(await getDb());
  const actor = await getWorkspace(actorId);
  if (!actor.user.schoolId || !["teacher", "admin"].includes(actor.user.role)) throw new Error("Only teachers and administrators can review sent notifications.");
  return db.select({ notification: notifications, recipient: users }).from(notifications).innerJoin(users, eq(users.id, notifications.recipientId)).where(and(eq(notifications.createdBy, actorId), eq(users.schoolId, actor.user.schoolId))).orderBy(desc(notifications.createdAt)).limit(30);
}

export async function markNotificationRead(userId: number, notificationId: number) {
  const db = requireDb(await getDb());
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, notificationId), eq(notifications.recipientId, userId)));
}

export async function createNotification(actorId: number, input: { recipientId: number; title: string; body: string; href?: string }) {
  const db = requireDb(await getDb());
  const actor = await getWorkspace(actorId);
  if (!actor.user.schoolId || !["teacher", "admin"].includes(actor.user.role)) throw new Error("Only teachers and administrators can send notifications.");
  const recipient = (await db.select().from(users).where(and(eq(users.id, input.recipientId), eq(users.schoolId, actor.user.schoolId))).limit(1))[0];
  if (!recipient) throw new Error("The recipient must belong to the active school.");
  const preferences = await ensureNotificationPreferences(input.recipientId);
  if (!preferences.staffUpdatesEnabled) {
    await audit(actorId, actor.user.schoolId, "notification.skipped.preference", "notification", undefined, { recipientId: input.recipientId, type: "staff" });
    return null;
  }
  const inserted = await db.insert(notifications).values({ recipientId: input.recipientId, createdBy: actorId, title: input.title, body: input.body, href: input.href });
  const notificationId = Number(inserted[0].insertId);
  await audit(actorId, actor.user.schoolId, "notification.created", "notification", String(notificationId), { recipientId: input.recipientId });
  return notificationId;
}

export async function sendTeacherBulkLearningReminder(actorId: number, target: "pending_tasks" | "low_progress" | "all", personalNote?: string) {
  const db = requireDb(await getDb());
  const actor = await getWorkspace(actorId);
  if (actor.user.role !== "teacher" || !actor.user.schoolId) throw new Error("Only teachers can send bulk learning reminders.");
  const managedCourses = await db.select({ id: courses.id }).from(courses).where(and(eq(courses.schoolId, actor.user.schoolId), eq(courses.teacherId, actorId)));
  const courseIds = managedCourses.map(course => course.id);
  if (!courseIds.length) return { targeted: 0, delivered: 0, skipped: 0 };
  const enrolled = await db.select({ studentId: enrollments.studentId, courseId: enrollments.courseId }).from(enrollments).where(and(inArray(enrollments.courseId, courseIds), eq(enrollments.status, "active")));
  const publishedAssignments = await db.select({ id: assignments.id, courseId: assignments.courseId }).from(assignments).where(and(inArray(assignments.courseId, courseIds), eq(assignments.status, "published")));
  const assignmentIds = publishedAssignments.map(assignment => assignment.id);
  const submissionRows = assignmentIds.length ? await db.select({ studentId: submissions.studentId, assignmentId: submissions.assignmentId, status: submissions.status }).from(submissions).where(inArray(submissions.assignmentId, assignmentIds)) : [];
  const submittedPairs = new Set(submissionRows.filter(row => ["submitted", "graded", "returned"].includes(row.status)).map(row => `${row.studentId}:${row.assignmentId}`));
  const assignmentsByCourse = new Map<number, number[]>();
  publishedAssignments.forEach(assignment => assignmentsByCourse.set(assignment.courseId, [...(assignmentsByCourse.get(assignment.courseId) ?? []), assignment.id]));
  const pendingTaskStudentIds = new Set(enrolled.filter(enrollment => (assignmentsByCourse.get(enrollment.courseId) ?? []).some(assignmentId => !submittedPairs.has(`${enrollment.studentId}:${assignmentId}`))).map(enrollment => enrollment.studentId));
  const attention = target === "pending_tasks" ? null : await getTeacherLearnerAttention(actorId);
  const lowProgressStudentIds = new Set(attention?.learnersNeedingFollowUp.map(learner => learner.studentId) ?? []);
  const candidateIds = Array.from(target === "pending_tasks" ? pendingTaskStudentIds : target === "low_progress" ? lowProgressStudentIds : new Set([...Array.from(pendingTaskStudentIds), ...Array.from(lowProgressStudentIds)])).slice(0, 200);
  if (!candidateIds.length) return { targeted: 0, delivered: 0, skipped: 0 };
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const title = target === "pending_tasks" ? "Reminder: published work is waiting" : target === "low_progress" ? "Reminder: keep your learning progress moving" : "Learning check-in from your teacher";
  const body = target === "pending_tasks" ? "Your teacher has identified published course work that is still awaiting your submission. Please review your assignments." : target === "low_progress" ? "Your teacher recommends revisiting your current course lessons to strengthen your progress." : "Your teacher has sent a learning check-in. Please review your current assignments and lesson progress.";
  const notificationBody = personalNote?.trim() ? `${body}\n\nNote from your teacher: ${personalNote.trim()}` : body;
  const alreadySent = await db.select({ recipientId: notifications.recipientId }).from(notifications).where(and(eq(notifications.createdBy, actorId), eq(notifications.title, title), inArray(notifications.recipientId, candidateIds), gte(notifications.createdAt, startOfDay)));
  const sentToday = new Set(alreadySent.map(row => row.recipientId));
  let delivered = 0;
  let skipped = 0;
  for (const recipientId of candidateIds) {
    if (sentToday.has(recipientId)) { skipped += 1; continue; }
    const preferences = await ensureNotificationPreferences(recipientId);
    if (!preferences.staffUpdatesEnabled) { skipped += 1; continue; }
    await db.insert(notifications).values({ recipientId, createdBy: actorId, title, body: notificationBody, href: "/app#assignments" });
    delivered += 1;
  }
  await audit(actorId, actor.user.schoolId, "teacher.bulk-reminder.sent", "notificationBatch", undefined, { target, targeted: candidateIds.length, delivered, skipped, hasPersonalNote: Boolean(personalNote?.trim()) });
  return { targeted: candidateIds.length, delivered, skipped };
}

export async function listTeacherReminderTemplates(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "teacher" || !profile.user.schoolId) throw new Error("Only teachers can manage reminder templates.");
  return db.select().from(teacherReminderTemplates).where(and(eq(teacherReminderTemplates.teacherId, userId), eq(teacherReminderTemplates.schoolId, profile.user.schoolId))).orderBy(desc(teacherReminderTemplates.updatedAt));
}

export async function createTeacherReminderTemplate(userId: number, input: { name: string; note: string }) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "teacher" || !profile.user.schoolId) throw new Error("Only teachers can save reminder templates.");
  const inserted = await db.insert(teacherReminderTemplates).values({ teacherId: userId, schoolId: profile.user.schoolId, name: input.name.trim(), note: input.note.trim() });
  const templateId = Number(inserted[0].insertId);
  await audit(userId, profile.user.schoolId, "teacher.reminder-template.created", "teacherReminderTemplate", String(templateId));
  return templateId;
}

export async function setTeacherReminderTemplateShared(userId: number, templateId: number, isShared: boolean) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "teacher" || !profile.user.schoolId) throw new Error("Only teachers can share reminder templates.");
  const template = (await db.select().from(teacherReminderTemplates).where(and(eq(teacherReminderTemplates.id, templateId), eq(teacherReminderTemplates.teacherId, userId), eq(teacherReminderTemplates.schoolId, profile.user.schoolId))).limit(1))[0];
  if (!template) throw new Error("Reminder template not found.");
  if (isShared) {
    await db.update(teacherReminderTemplates).set({ isShared: false, sharingStatus: "pending", submittedAt: new Date(), reviewedAt: null, reviewedBy: null, reviewNote: null }).where(eq(teacherReminderTemplates.id, templateId));
    await audit(userId, profile.user.schoolId, "teacher.reminder-template.submitted", "teacherReminderTemplate", String(templateId));
    return { id: templateId, isShared: false, sharingStatus: "pending" as const };
  }
  await db.update(teacherReminderTemplates).set({ isShared: false, sharingStatus: "draft" }).where(eq(teacherReminderTemplates.id, templateId));
  await audit(userId, profile.user.schoolId, "teacher.reminder-template.withdrawn", "teacherReminderTemplate", String(templateId));
  return { id: templateId, isShared: false, sharingStatus: "draft" as const };
}

export async function listSchoolReminderTemplateLibrary(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "teacher" || !profile.user.schoolId) throw new Error("Only teachers can view the school reminder library.");
  return db.select({ id: teacherReminderTemplates.id, teacherId: teacherReminderTemplates.teacherId, name: teacherReminderTemplates.name, note: teacherReminderTemplates.note, updatedAt: teacherReminderTemplates.updatedAt, teacherName: users.name }).from(teacherReminderTemplates).innerJoin(users, eq(users.id, teacherReminderTemplates.teacherId)).where(and(eq(teacherReminderTemplates.schoolId, profile.user.schoolId), eq(teacherReminderTemplates.isShared, true), eq(teacherReminderTemplates.sharingStatus, "approved"))).orderBy(desc(teacherReminderTemplates.updatedAt));
}

export async function copySchoolReminderTemplate(userId: number, templateId: number, name: string) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "teacher" || !profile.user.schoolId) throw new Error("Only teachers can copy school reminder templates.");
  const template = (await db.select().from(teacherReminderTemplates).where(and(eq(teacherReminderTemplates.id, templateId), eq(teacherReminderTemplates.schoolId, profile.user.schoolId), eq(teacherReminderTemplates.isShared, true), eq(teacherReminderTemplates.sharingStatus, "approved"))).limit(1))[0];
  if (!template) throw new Error("Shared reminder template not found.");
  if (template.teacherId === userId) throw new Error("This is already your reminder template.");
  const inserted = await db.insert(teacherReminderTemplates).values({ teacherId: userId, schoolId: profile.user.schoolId, name: name.trim(), note: template.note, isShared: false });
  const copiedId = Number(inserted[0].insertId);
  await audit(userId, profile.user.schoolId, "teacher.reminder-template.copied", "teacherReminderTemplate", String(copiedId), { sourceTemplateId: templateId });
  return copiedId;
}

export async function listReminderTemplateApprovalQueue(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can review shared reminder templates.");
  return db.select({ id: teacherReminderTemplates.id, teacherId: teacherReminderTemplates.teacherId, name: teacherReminderTemplates.name, note: teacherReminderTemplates.note, sharingStatus: teacherReminderTemplates.sharingStatus, submittedAt: teacherReminderTemplates.submittedAt, reviewNote: teacherReminderTemplates.reviewNote, teacherName: users.name, teacherEmail: users.email }).from(teacherReminderTemplates).innerJoin(users, eq(users.id, teacherReminderTemplates.teacherId)).where(and(eq(teacherReminderTemplates.schoolId, profile.user.schoolId), eq(teacherReminderTemplates.sharingStatus, "pending"))).orderBy(asc(teacherReminderTemplates.submittedAt));
}

export function buildReminderTemplateReviewNotification(templateName: string, approved: boolean, reviewNote?: string) {
  const normalizedNote = reviewNote?.trim();
  return { title: approved ? "Reminder template approved" : "Reminder template needs changes", body: approved ? `“${templateName}” is now available in the school reminder library.${normalizedNote ? ` Review note: ${normalizedNote}` : ""}` : `“${templateName}” was not approved for the school library. Reviewer feedback: ${normalizedNote}`, href: "/app#dashboard" };
}

export async function reviewReminderTemplateSubmission(userId: number, templateId: number, approved: boolean, reviewNote?: string) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can review shared reminder templates.");
  const template = (await db.select().from(teacherReminderTemplates).where(and(eq(teacherReminderTemplates.id, templateId), eq(teacherReminderTemplates.schoolId, profile.user.schoolId), eq(teacherReminderTemplates.sharingStatus, "pending"))).limit(1))[0];
  if (!template) throw new Error("Pending reminder template was not found.");
  const normalizedNote = reviewNote?.trim();
  if (!approved && (!normalizedNote || normalizedNote.length < 3)) throw new Error("A feedback comment of at least 3 characters is required when rejecting a reminder template.");
  const reviewedAt = new Date();
  const sharingStatus = approved ? "approved" as const : "rejected" as const;
  await db.update(teacherReminderTemplates).set({ isShared: approved, sharingStatus, reviewedAt, reviewedBy: userId, reviewNote: normalizedNote || null }).where(eq(teacherReminderTemplates.id, templateId));
  await audit(userId, profile.user.schoolId, approved ? "admin.reminder-template.approved" : "admin.reminder-template.rejected", "teacherReminderTemplate", String(templateId), { teacherId: template.teacherId, reviewNote: normalizedNote || undefined });
  await createNotification(userId, { recipientId: template.teacherId, ...buildReminderTemplateReviewNotification(template.name, approved, normalizedNote) });
  return { id: templateId, sharingStatus, isShared: approved, reviewedAt };
}

export async function deleteTeacherReminderTemplate(userId: number, templateId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "teacher" || !profile.user.schoolId) throw new Error("Only teachers can delete reminder templates.");
  const existing = (await db.select().from(teacherReminderTemplates).where(and(eq(teacherReminderTemplates.id, templateId), eq(teacherReminderTemplates.teacherId, userId), eq(teacherReminderTemplates.schoolId, profile.user.schoolId))).limit(1))[0];
  if (!existing) throw new Error("Reminder template not found.");
  await db.delete(teacherReminderTemplates).where(eq(teacherReminderTemplates.id, templateId));
  await audit(userId, profile.user.schoolId, "teacher.reminder-template.deleted", "teacherReminderTemplate", String(templateId));
  return { id: templateId, deleted: true as const };
}

type InterventionComparisonViewInput = { name: string; courseId?: number; classSection?: string; startAt?: Date; endAt?: Date; comparisonCourseId?: number; comparisonClassSection?: string; normalized: boolean };

export async function listAdminInterventionComparisonViews(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can manage comparison views.");
  return db.select({ id: adminInterventionComparisonViews.id, ownerId: adminInterventionComparisonViews.ownerId, schoolId: adminInterventionComparisonViews.schoolId, name: adminInterventionComparisonViews.name, courseId: adminInterventionComparisonViews.courseId, classSection: adminInterventionComparisonViews.classSection, startAt: adminInterventionComparisonViews.startAt, endAt: adminInterventionComparisonViews.endAt, comparisonCourseId: adminInterventionComparisonViews.comparisonCourseId, comparisonClassSection: adminInterventionComparisonViews.comparisonClassSection, normalized: adminInterventionComparisonViews.normalized, shareToken: adminInterventionComparisonViews.shareToken, shareExpiresAt: adminInterventionComparisonViews.shareExpiresAt, passwordProtected: sql<boolean>`${adminInterventionComparisonViews.sharePasswordHash} is not null`, createdAt: adminInterventionComparisonViews.createdAt, updatedAt: adminInterventionComparisonViews.updatedAt }).from(adminInterventionComparisonViews).where(and(eq(adminInterventionComparisonViews.ownerId, userId), eq(adminInterventionComparisonViews.schoolId, profile.user.schoolId))).orderBy(desc(adminInterventionComparisonViews.updatedAt));
}

export async function createAdminInterventionComparisonView(userId: number, input: InterventionComparisonViewInput) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can save comparison views.");
  const selectedCourseIds = [input.courseId, input.comparisonCourseId].filter((value): value is number => Boolean(value));
  if (selectedCourseIds.length) {
    const validCourses = await db.select({ id: courses.id }).from(courses).where(and(eq(courses.schoolId, profile.user.schoolId), inArray(courses.id, selectedCourseIds)));
    if (validCourses.length !== new Set(selectedCourseIds).size) throw new Error("A selected course is not available to this school.");
  }
  const inserted = await db.insert(adminInterventionComparisonViews).values({ ownerId: userId, schoolId: profile.user.schoolId, name: input.name.trim(), courseId: input.courseId, classSection: input.classSection?.trim() || null, startAt: input.startAt, endAt: input.endAt, comparisonCourseId: input.comparisonCourseId, comparisonClassSection: input.comparisonClassSection?.trim() || null, normalized: input.normalized });
  const viewId = Number(inserted[0].insertId);
  await audit(userId, profile.user.schoolId, "admin.intervention-view.created", "adminInterventionComparisonView", String(viewId), { hasComparison: Boolean(input.comparisonCourseId || input.comparisonClassSection), normalized: input.normalized });
  return viewId;
}

export async function deleteAdminInterventionComparisonView(userId: number, viewId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can delete comparison views.");
  const view = (await db.select({ id: adminInterventionComparisonViews.id }).from(adminInterventionComparisonViews).where(and(eq(adminInterventionComparisonViews.id, viewId), eq(adminInterventionComparisonViews.ownerId, userId), eq(adminInterventionComparisonViews.schoolId, profile.user.schoolId))).limit(1))[0];
  if (!view) throw new Error("Comparison view not found.");
  await db.delete(adminInterventionComparisonViews).where(eq(adminInterventionComparisonViews.id, viewId));
  await audit(userId, profile.user.schoolId, "admin.intervention-view.deleted", "adminInterventionComparisonView", String(viewId));
  return { id: viewId, deleted: true as const };
}

type ComparisonShareOptions = { expiresAt?: Date; password?: string };

function hashComparisonSharePassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return { sharePasswordSalt: salt, sharePasswordHash: scryptSync(password, salt, 32).toString("hex") };
}

function isComparisonSharePasswordValid(password: string | undefined, salt: string | null, hash: string | null) {
  if (!salt || !hash) return true;
  if (!password) return false;
  const expected = Buffer.from(hash, "hex");
  const received = scryptSync(password, salt, 32);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function setAdminInterventionComparisonViewSharing(userId: number, viewId: number, share: boolean, options?: ComparisonShareOptions) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can share comparison views.");
  const view = (await db.select({ id: adminInterventionComparisonViews.id }).from(adminInterventionComparisonViews).where(and(eq(adminInterventionComparisonViews.id, viewId), eq(adminInterventionComparisonViews.ownerId, userId), eq(adminInterventionComparisonViews.schoolId, profile.user.schoolId))).limit(1))[0];
  if (!view) throw new Error("Comparison view not found.");
  if (options?.expiresAt && (options.expiresAt <= new Date() || options.expiresAt.getTime() - Date.now() > 90 * 86_400_000)) throw new Error("Choose a share expiry between now and 90 days from now.");
  if (options?.password && (options.password.length < 8 || options.password.length > 128)) throw new Error("Share passwords must contain 8 to 128 characters.");
  const passwordFields = share && options?.password ? hashComparisonSharePassword(options.password) : { sharePasswordHash: null, sharePasswordSalt: null };
  const shareToken = share ? nanoid(48) : null;
  await db.update(adminInterventionComparisonViews).set({ shareToken, shareExpiresAt: share ? options?.expiresAt ?? null : null, ...passwordFields }).where(eq(adminInterventionComparisonViews.id, viewId));
  await audit(userId, profile.user.schoolId, share ? "admin.intervention-view.shared" : "admin.intervention-view.share-revoked", "adminInterventionComparisonView", String(viewId), share ? { expiresAt: options?.expiresAt?.toISOString() ?? null, passwordProtected: Boolean(options?.password) } : undefined);
  return { id: viewId, shareToken, shareExpiresAt: share ? options?.expiresAt ?? null : null, passwordProtected: Boolean(share && options?.password) };
}

export async function getSharedAdminInterventionComparisonView(userId: number, shareToken: string, password?: string) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can open shared comparison views.");
  const view = (await db.select().from(adminInterventionComparisonViews).where(and(eq(adminInterventionComparisonViews.shareToken, shareToken), eq(adminInterventionComparisonViews.schoolId, profile.user.schoolId))).limit(1))[0];
  if (!view) throw new Error("Shared comparison view is unavailable or has been revoked.");
  if (view.shareExpiresAt && view.shareExpiresAt <= new Date()) return { status: "expired" as const };
  if (!isComparisonSharePasswordValid(password, view.sharePasswordSalt, view.sharePasswordHash)) return { status: "password_required" as const };
  return { status: "ready" as const, id: view.id, name: view.name, courseId: view.courseId, classSection: view.classSection, startAt: view.startAt, endAt: view.endAt, comparisonCourseId: view.comparisonCourseId, comparisonClassSection: view.comparisonClassSection, normalized: view.normalized, sharedBy: view.ownerId, shareExpiresAt: view.shareExpiresAt };
}

export async function getMonthlyCertificateAuditReportSchedule(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can manage monthly audit reports.");
  const schedule = (await db.select().from(monthlyCertificateAuditReportSchedules).where(eq(monthlyCertificateAuditReportSchedules.schoolId, profile.user.schoolId)).limit(1))[0];
  const admins = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(and(eq(users.schoolId, profile.user.schoolId), eq(users.role, "admin"))).orderBy(asc(users.name));
  return { schedule: schedule ?? null, admins };
}

type MonthlyCertificateAuditScheduleInput = { enabled: boolean; recipientIds: number[] };

export async function updateMonthlyCertificateAuditReportSchedule(userId: number, input: MonthlyCertificateAuditScheduleInput, sessionToken: string) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can manage monthly audit reports.");
  const recipientIds = Array.from(new Set(input.recipientIds));
  if (input.enabled && !recipientIds.length) throw new Error("Choose at least one administrator to receive the monthly report.");
  const validRecipients = recipientIds.length ? await db.select({ id: users.id }).from(users).where(and(eq(users.schoolId, profile.user.schoolId), eq(users.role, "admin"), inArray(users.id, recipientIds))) : [];
  if (validRecipients.length !== recipientIds.length) throw new Error("Monthly report recipients must be active administrators in this school.");
  const current = (await db.select().from(monthlyCertificateAuditReportSchedules).where(eq(monthlyCertificateAuditReportSchedules.schoolId, profile.user.schoolId)).limit(1))[0];
  if (input.enabled && process.env.NODE_ENV !== "production") throw new Error("Publish the latest Educonnect release before activating monthly audit delivery.");
  let scheduleCronTaskUid = current?.scheduleCronTaskUid ?? null;
  if (input.enabled) {
    const job = { cron: "0 0 9 1 * *", path: "/api/scheduled/monthly-certificate-audit", payload: {}, description: `Educonnect monthly in-app certificate revocation audit report for school ${profile.user.schoolId}` };
    const schedule = scheduleCronTaskUid ? await updateHeartbeatJob(scheduleCronTaskUid, { ...job, enable: true }, sessionToken) : await createHeartbeatJob({ name: `educonnect-monthly-certificate-audit-${profile.user.schoolId}`, ...job }, sessionToken);
    if (!scheduleCronTaskUid) scheduleCronTaskUid = (schedule as { taskUid: string }).taskUid;
  } else if (scheduleCronTaskUid) {
    await updateHeartbeatJob(scheduleCronTaskUid, { enable: false }, sessionToken);
  }
  if (current) await db.update(monthlyCertificateAuditReportSchedules).set({ configuredBy: userId, recipientIds, enabled: input.enabled, scheduleCronTaskUid }).where(eq(monthlyCertificateAuditReportSchedules.id, current.id));
  else await db.insert(monthlyCertificateAuditReportSchedules).values({ schoolId: profile.user.schoolId, configuredBy: userId, recipientIds, enabled: input.enabled, scheduleCronTaskUid });
  await audit(userId, profile.user.schoolId, "admin.monthly-certificate-audit.schedule-updated", "monthlyCertificateAuditReportSchedule", String(current?.id ?? profile.user.schoolId), { enabled: input.enabled, recipientCount: recipientIds.length });
  return getMonthlyCertificateAuditReportSchedule(userId);
}

export async function deliverScheduledMonthlyCertificateAuditReport(taskUid: string) {
  const db = requireDb(await getDb());
  const schedule = (await db.select().from(monthlyCertificateAuditReportSchedules).where(eq(monthlyCertificateAuditReportSchedules.scheduleCronTaskUid, taskUid)).limit(1))[0];
  if (!schedule) return { ok: true, skipped: "orphan" as const };
  if (!schedule.enabled || !schedule.recipientIds.length) return { ok: true, skipped: "disabled" as const };
  const now = new Date();
  if (schedule.lastRunAt && schedule.lastRunAt.getUTCFullYear() === now.getUTCFullYear() && schedule.lastRunAt.getUTCMonth() === now.getUTCMonth()) return { ok: true, skipped: "already-delivered" as const };
  const startAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const endAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1);
  const report = await createCertificateRevocationAuditExport(schedule.configuredBy, { startAt, endAt });
  for (const recipientId of schedule.recipientIds) await createNotification(schedule.configuredBy, { recipientId, title: "Monthly certificate revocation audit is ready", body: `The ${startAt.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })} certificate revocation audit is ready to download (${report.eventCount} event${report.eventCount === 1 ? "" : "s"}).`, href: report.url });
  const completedAt = new Date();
  await db.update(monthlyCertificateAuditReportSchedules).set({ lastRunAt: completedAt, lastReportExportId: report.id }).where(eq(monthlyCertificateAuditReportSchedules.id, schedule.id));
  await audit(schedule.configuredBy, schedule.schoolId, "admin.monthly-certificate-audit.delivered", "monthlyCertificateAuditReportSchedule", String(schedule.id), { reportExportId: report.id, recipientCount: schedule.recipientIds.length, startAt: startAt.toISOString(), endAt: endAt.toISOString() });
  return { ok: true, reportId: report.id, recipientCount: schedule.recipientIds.length };
}

export async function getSchoolAnalytics(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can view school analytics.");
  const [studentCount] = await db.select({ count: sql<number>`count(*)` }).from(users).where(and(eq(users.schoolId, profile.user.schoolId), eq(users.role, "user")));
  const [teacherCount] = await db.select({ count: sql<number>`count(*)` }).from(users).where(and(eq(users.schoolId, profile.user.schoolId), eq(users.role, "teacher")));
  const [courseCount] = await db.select({ count: sql<number>`count(*)` }).from(courses).where(eq(courses.schoolId, profile.user.schoolId));
  const [completionCount] = await db.select({ count: sql<number>`count(*)` }).from(lessonProgress).innerJoin(users, eq(users.id, lessonProgress.studentId)).where(and(eq(users.schoolId, profile.user.schoolId), eq(lessonProgress.completed, true)));
  const [submissionCount] = await db.select({ count: sql<number>`count(*)` }).from(submissions).innerJoin(assignments, eq(assignments.id, submissions.assignmentId)).innerJoin(courses, eq(courses.id, assignments.courseId)).where(eq(courses.schoolId, profile.user.schoolId));
  return { students: Number(studentCount?.count ?? 0), teachers: Number(teacherCount?.count ?? 0), courses: Number(courseCount?.count ?? 0), completedLessons: Number(completionCount?.count ?? 0), submissions: Number(submissionCount?.count ?? 0), generatedAt: new Date() };
}

type InterventionAnalyticsFilter = { courseId?: number; classSection?: string; startAt?: Date; endAt?: Date; comparisonCourseId?: number; comparisonClassSection?: string };

function monthKey(date: Date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }

async function buildSchoolInterventionAnalytics(schoolId: number, filters: InterventionAnalyticsFilter = {}) {
  const db = requireDb(await getDb());
  const now = new Date();
  const students = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(and(eq(users.schoolId, schoolId), eq(users.role, "user")));
  const schoolCourses = await db.select({ id: courses.id, code: courses.code, title: courses.title, classSection: courses.classSection }).from(courses).where(eq(courses.schoolId, schoolId)).orderBy(asc(courses.code));
  const classSections = Array.from(new Set(schoolCourses.map(course => course.classSection).filter((value): value is string => Boolean(value)))).sort();
  const selectedCourses = schoolCourses.filter(course => (!filters.courseId || course.id === filters.courseId) && (!filters.classSection || course.classSection === filters.classSection));
  if (filters.courseId && !schoolCourses.some(course => course.id === filters.courseId)) throw new Error("Selected course is not available to this school.");
  const courseIds = selectedCourses.map(course => course.id);
  const filterOptions = { courses: schoolCourses, classSections };
  const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const rangeStart = filters.startAt ?? defaultStart;
  const rangeEnd = filters.endAt ?? now;
  const monthCount = Math.max(1, ((rangeEnd.getUTCFullYear() - rangeStart.getUTCFullYear()) * 12) + rangeEnd.getUTCMonth() - rangeStart.getUTCMonth() + 1);
  const months = Array.from({ length: monthCount }, (_, index) => { const value = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth() + index, 1)); return { key: monthKey(value), month: value.toLocaleString("en-US", { month: "short", timeZone: "UTC" }), completedLessons: 0, submittedWork: 0, unresolvedDueWork: 0, assessmentPerformancePercent: null as number | null, assessmentTotal: 0, assessmentCount: 0 }; });
  const trendByMonth = new Map(months.map(month => [month.key, month]));
  const inRange = (date: Date) => date >= rangeStart && date <= rangeEnd;
  if (!students.length || !courseIds.length) return { generatedAt: now, students: students.length, overdueTasks: 0, lowProgressEnrollments: 0, pendingGrading: 0, assessmentPerformancePercent: null as number | null, interventionStudents: [] as Array<{ studentId: number; name: string | null; email: string | null; pendingTasks: number; overdueTasks: number; lowProgressCourses: number }>, filterOptions, monthlyTrend: months.map(({ assessmentTotal, assessmentCount, ...month }) => month) };
  const enrolled = await db.select({ studentId: enrollments.studentId, courseId: enrollments.courseId }).from(enrollments).where(and(inArray(enrollments.courseId, courseIds), eq(enrollments.status, "active")));
  const publishedAssignments = await db.select({ id: assignments.id, courseId: assignments.courseId, dueAt: assignments.dueAt }).from(assignments).where(and(inArray(assignments.courseId, courseIds), eq(assignments.status, "published")));
  const assignmentIds = publishedAssignments.map(assignment => assignment.id);
  const submissionRows = assignmentIds.length ? await db.select({ studentId: submissions.studentId, assignmentId: submissions.assignmentId, status: submissions.status, submittedAt: submissions.submittedAt }).from(submissions).where(inArray(submissions.assignmentId, assignmentIds)) : [];
  const submittedPairs = new Set(submissionRows.filter(row => ["submitted", "graded", "returned"].includes(row.status)).map(row => `${row.studentId}:${row.assignmentId}`));
  const assignmentsByCourse = new Map<number, Array<{ id: number; dueAt: Date | null }>>();
  publishedAssignments.forEach(assignment => assignmentsByCourse.set(assignment.courseId, [...(assignmentsByCourse.get(assignment.courseId) ?? []), assignment]));
  const modules = await db.select({ id: courseModules.id, courseId: courseModules.courseId }).from(courseModules).where(inArray(courseModules.courseId, courseIds));
  const moduleIds = modules.map(module => module.id);
  const courseByModule = new Map(modules.map(module => [module.id, module.courseId]));
  const publishedLessons = moduleIds.length ? await db.select({ id: lessons.id, moduleId: lessons.moduleId }).from(lessons).where(and(inArray(lessons.moduleId, moduleIds), eq(lessons.isPublished, true))) : [];
  const courseByLesson = new Map<number, number>();
  const totalsByCourse = new Map<number, number>();
  publishedLessons.forEach(lesson => { const courseId = courseByModule.get(lesson.moduleId); if (!courseId) return; courseByLesson.set(lesson.id, courseId); totalsByCourse.set(courseId, (totalsByCourse.get(courseId) ?? 0) + 1); });
  const studentIds = students.map(student => student.id);
  const completedRows = studentIds.length && publishedLessons.length ? await db.select({ studentId: lessonProgress.studentId, lessonId: lessonProgress.lessonId, completedAt: lessonProgress.completedAt }).from(lessonProgress).where(and(inArray(lessonProgress.studentId, studentIds), inArray(lessonProgress.lessonId, publishedLessons.map(lesson => lesson.id)), eq(lessonProgress.completed, true))) : [];
  const completedByEnrollment = new Map<string, number>();
  completedRows.forEach(row => { const courseId = courseByLesson.get(row.lessonId); if (!courseId) return; const key = `${row.studentId}:${courseId}`; completedByEnrollment.set(key, (completedByEnrollment.get(key) ?? 0) + 1); });
  const pendingByStudent = new Map<number, number>();
  const overdueByStudent = new Map<number, number>();
  const lowProgressByStudent = new Map<number, number>();
  enrolled.forEach(enrollment => { const courseAssignments = assignmentsByCourse.get(enrollment.courseId) ?? []; courseAssignments.forEach(assignment => { if (!submittedPairs.has(`${enrollment.studentId}:${assignment.id}`)) { pendingByStudent.set(enrollment.studentId, (pendingByStudent.get(enrollment.studentId) ?? 0) + 1); if (assignment.dueAt && assignment.dueAt < now) { overdueByStudent.set(enrollment.studentId, (overdueByStudent.get(enrollment.studentId) ?? 0) + 1); if (inRange(assignment.dueAt)) { const month = trendByMonth.get(monthKey(assignment.dueAt)); if (month) month.unresolvedDueWork += 1; } } } }); const total = totalsByCourse.get(enrollment.courseId) ?? 0; const completed = completedByEnrollment.get(`${enrollment.studentId}:${enrollment.courseId}`) ?? 0; if (total > 0 && Math.round((completed / total) * 100) < 50) lowProgressByStudent.set(enrollment.studentId, (lowProgressByStudent.get(enrollment.studentId) ?? 0) + 1); });
  completedRows.forEach(row => { if (!row.completedAt || !inRange(row.completedAt)) return; const month = trendByMonth.get(monthKey(row.completedAt)); if (month) month.completedLessons += 1; });
  submissionRows.forEach(row => { if (!row.submittedAt || !inRange(row.submittedAt) || !["submitted", "graded", "returned"].includes(row.status)) return; const month = trendByMonth.get(monthKey(row.submittedAt)); if (month) month.submittedWork += 1; });
  const attempts = await db.select({ examId: quizAttempts.examId, score: quizAttempts.score, submittedAt: quizAttempts.submittedAt }).from(quizAttempts).innerJoin(exams, eq(exams.id, quizAttempts.examId)).where(and(inArray(exams.courseId, courseIds), sql`${quizAttempts.submittedAt} is not null`));
  const examIds = Array.from(new Set(attempts.map(attempt => attempt.examId)));
  const pointTotals = examIds.length ? await db.select({ examId: examQuestions.examId, total: sql<number>`coalesce(sum(${examQuestions.points}), 0)` }).from(examQuestions).where(inArray(examQuestions.examId, examIds)).groupBy(examQuestions.examId) : [];
  const maxPointsByExam = new Map(pointTotals.map(row => [row.examId, Number(row.total ?? 0)]));
  const performanceValues = attempts.map(attempt => { const maxPoints = maxPointsByExam.get(attempt.examId) ?? 0; const value = maxPoints ? (Number(attempt.score ?? 0) / maxPoints) * 100 : null; if (value !== null && attempt.submittedAt && inRange(attempt.submittedAt)) { const month = trendByMonth.get(monthKey(attempt.submittedAt)); if (month) { month.assessmentTotal += value; month.assessmentCount += 1; } } return value; }).filter((value): value is number => value !== null);
  const interventionStudents = students.map(student => ({ studentId: student.id, name: student.name, email: student.email, pendingTasks: pendingByStudent.get(student.id) ?? 0, overdueTasks: overdueByStudent.get(student.id) ?? 0, lowProgressCourses: lowProgressByStudent.get(student.id) ?? 0 })).filter(student => student.pendingTasks || student.overdueTasks || student.lowProgressCourses).sort((a, b) => (b.overdueTasks * 3 + b.pendingTasks + b.lowProgressCourses * 2) - (a.overdueTasks * 3 + a.pendingTasks + a.lowProgressCourses * 2)).slice(0, 30);
  const monthlyTrend = months.map(({ assessmentTotal, assessmentCount, ...month }) => ({ ...month, assessmentPerformancePercent: assessmentCount ? Math.round(assessmentTotal / assessmentCount) : null }));
  return { generatedAt: now, students: students.length, overdueTasks: Array.from(overdueByStudent.values()).reduce((sum, value) => sum + value, 0), lowProgressEnrollments: Array.from(lowProgressByStudent.values()).reduce((sum, value) => sum + value, 0), pendingGrading: submissionRows.filter(row => row.status === "submitted").length, assessmentPerformancePercent: performanceValues.length ? Math.round(performanceValues.reduce((sum, value) => sum + value, 0) / performanceValues.length) : null, interventionStudents, filterOptions, monthlyTrend };
}

export async function getSchoolInterventionAnalytics(userId: number, filters?: InterventionAnalyticsFilter) {
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can view intervention analytics.");
  const analytics = await buildSchoolInterventionAnalytics(profile.user.schoolId, filters);
  if (!filters?.comparisonCourseId && !filters?.comparisonClassSection) return { ...analytics, cohortComparison: null };
  const comparison = await buildSchoolInterventionAnalytics(profile.user.schoolId, { courseId: filters.comparisonCourseId, classSection: filters.comparisonClassSection, startAt: filters.startAt, endAt: filters.endAt });
  const comparisonCourse = filters.comparisonCourseId ? analytics.filterOptions.courses.find(course => course.id === filters.comparisonCourseId) : undefined;
  const label = comparisonCourse ? `${comparisonCourse.code} · ${comparisonCourse.title}` : filters.comparisonClassSection ?? "Comparison cohort";
  return { ...analytics, cohortComparison: { label, monthlyTrend: comparison.monthlyTrend } };
}

export async function createSchoolInterventionExport(userId: number, filters?: InterventionAnalyticsFilter) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can export intervention analytics.");
  const analytics = await buildSchoolInterventionAnalytics(profile.user.schoolId, filters);
  const comparison = filters?.comparisonCourseId || filters?.comparisonClassSection ? await buildSchoolInterventionAnalytics(profile.user.schoolId, { courseId: filters.comparisonCourseId, classSection: filters.comparisonClassSection, startAt: filters.startAt, endAt: filters.endAt }) : null;
  const comparisonCourse = filters?.comparisonCourseId ? analytics.filterOptions.courses.find(course => course.id === filters.comparisonCourseId) : undefined;
  const comparisonLabel = comparisonCourse ? `${comparisonCourse.code} · ${comparisonCourse.title}` : filters?.comparisonClassSection ?? "";
  const inserted = await db.insert(reportExports).values({ requestedBy: userId, type: "intervention", filterSnapshot: { generatedAt: analytics.generatedAt.toISOString(), ...filters }, status: "queued" });
  const exportId = Number(inserted[0].insertId);
  try {
    const rows = [["school_intervention_summary"], ["generated_at", analytics.generatedAt.toISOString()], ["course_filter", filters?.courseId ?? "all"], ["grade_filter", filters?.classSection ?? "all"], ["trend_start", filters?.startAt?.toISOString() ?? "default"], ["trend_end", filters?.endAt?.toISOString() ?? "current"], ["comparison_cohort", comparisonLabel || "none"], ["students", analytics.students], ["overdue_tasks", analytics.overdueTasks], ["low_progress_enrollments", analytics.lowProgressEnrollments], ["pending_grading", analytics.pendingGrading], ["assessment_performance_percent", analytics.assessmentPerformancePercent ?? ""], [""], ["month_over_month_trend"], ["month", "completed_lessons", "submitted_work", "unresolved_due_work", "assessment_performance_percent"], ...analytics.monthlyTrend.map(month => [month.month, month.completedLessons, month.submittedWork, month.unresolvedDueWork, month.assessmentPerformancePercent ?? ""]), ...(comparison ? [[""], ["comparison_month_over_month_trend"], ["month", "completed_lessons", "submitted_work", "unresolved_due_work", "assessment_performance_percent"], ...comparison.monthlyTrend.map(month => [month.month, month.completedLessons, month.submittedWork, month.unresolvedDueWork, month.assessmentPerformancePercent ?? ""])] : []), [""], ["student_interventions"], ["student_id", "student_name", "student_email", "pending_tasks", "overdue_tasks", "low_progress_courses"], ...analytics.interventionStudents.map(student => [student.studentId, student.name, student.email, student.pendingTasks, student.overdueTasks, student.lowProgressCourses])].map(row => row.map(csvEscape).join(",")).join("\n");
    const stored = await storagePut(`educonnect/exports/school-${profile.user.schoolId}/intervention-export-${exportId}.csv`, `\uFEFF${rows}`, "text/csv;charset=utf-8");
    await db.update(reportExports).set({ status: "ready", storageKey: stored.key }).where(eq(reportExports.id, exportId));
    await audit(userId, profile.user.schoolId, "intervention.export.ready", "reportExport", String(exportId), { storageKey: stored.key });
    return { id: exportId, status: "ready" as const, url: stored.url };
  } catch (error) {
    await db.update(reportExports).set({ status: "failed" }).where(eq(reportExports.id, exportId));
    await audit(userId, profile.user.schoolId, "intervention.export.failed", "reportExport", String(exportId));
    throw error;
  }
}

export async function createExam(actorId: number, input: { courseId: number; title: string; description?: string; durationMinutes: number; publish: boolean }) {
  const { db, actor } = await requireCourseManager(actorId, input.courseId);
  const inserted = await db.insert(exams).values({ courseId: input.courseId, authorId: actorId, title: input.title, description: input.description, durationMinutes: input.durationMinutes, status: input.publish ? "published" : "draft" });
  const examId = Number(inserted[0].insertId);
  await audit(actorId, actor.user.schoolId, "exam.created", "exam", String(examId), { courseId: input.courseId });
  return examId;
}

export async function addExamQuestion(actorId: number, input: { examId: number; prompt: string; options: string[]; answerKey: string; points: number; position: number }) {
  const db = requireDb(await getDb());
  const exam = (await db.select().from(exams).where(eq(exams.id, input.examId)).limit(1))[0];
  if (!exam) throw new Error("Exam not found.");
  const { actor } = await requireCourseManager(actorId, exam.courseId);
  if (!input.options.includes(input.answerKey)) throw new Error("The answer key must be one of the listed options.");
  const inserted = await db.insert(examQuestions).values({ examId: input.examId, prompt: input.prompt, type: "multiple_choice", options: input.options, answerKey: input.answerKey, points: input.points, position: input.position });
  const questionId = Number(inserted[0].insertId);
  await audit(actorId, actor.user.schoolId, "exam.question.created", "examQuestion", String(questionId), { examId: input.examId });
  return questionId;
}

export async function listExams(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (!profile.user.schoolId) return [];
  if (profile.user.role === "user") return db.select({ exam: exams, course: courses, attempt: quizAttempts }).from(enrollments).innerJoin(courses, eq(courses.id, enrollments.courseId)).innerJoin(exams, eq(exams.courseId, courses.id)).leftJoin(quizAttempts, and(eq(quizAttempts.examId, exams.id), eq(quizAttempts.studentId, userId))).where(and(eq(enrollments.studentId, userId), eq(exams.status, "published"))).orderBy(desc(exams.createdAt));
  return db.select({ exam: exams, course: courses }).from(exams).innerJoin(courses, eq(courses.id, exams.courseId)).where(eq(courses.schoolId, profile.user.schoolId)).orderBy(desc(exams.createdAt));
}

export async function getExamForAttempt(userId: number, examId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  const exam = (await db.select().from(exams).where(eq(exams.id, examId)).limit(1))[0];
  if (!exam || !profile.user.schoolId) throw new Error("Exam not found.");
  if (profile.user.role === "user") {
    const enrollment = (await db.select().from(enrollments).where(and(eq(enrollments.courseId, exam.courseId), eq(enrollments.studentId, userId), eq(enrollments.status, "active"))).limit(1))[0];
    if (!enrollment || exam.status !== "published") throw new Error("This exam is not available to you.");
  }
  const questions = await db.select({ id: examQuestions.id, prompt: examQuestions.prompt, options: examQuestions.options, points: examQuestions.points, position: examQuestions.position }).from(examQuestions).where(eq(examQuestions.examId, examId)).orderBy(asc(examQuestions.position));
  return { exam, questions };
}

export async function submitExamAttempt(userId: number, examId: number, answers: Record<string, string>) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") throw new Error("Only students can submit exam attempts.");
  await getExamForAttempt(userId, examId);
  const questions = await db.select().from(examQuestions).where(eq(examQuestions.examId, examId));
  const score = questions.reduce((total, question) => total + (question.answerKey && answers[String(question.id)] === question.answerKey ? question.points : 0), 0);
  const inserted = await db.insert(quizAttempts).values({ examId, studentId: userId, answers, score, submittedAt: new Date() });
  const attemptId = Number(inserted[0].insertId);
  await recordStudentEngagement(userId);
  await audit(userId, profile.user.schoolId, "exam.attempt.submitted", "quizAttempt", String(attemptId), { examId, score });
  return { id: attemptId, score, maxScore: questions.reduce((total, question) => total + question.points, 0) };
}

export async function listMyAssessmentResults(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "user") throw new Error("Assessment results are available to student accounts.");
  return db.select({ attempt: quizAttempts, exam: exams, course: courses }).from(quizAttempts).innerJoin(exams, eq(exams.id, quizAttempts.examId)).innerJoin(courses, eq(courses.id, exams.courseId)).where(eq(quizAttempts.studentId, userId)).orderBy(desc(quizAttempts.submittedAt));
}

export async function listAssessmentAttemptsForReview(actorId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(actorId);
  if (!profile.user.schoolId || !["teacher", "admin"].includes(profile.user.role)) throw new Error("Only teachers and administrators can review assessment attempts.");
  const where = profile.user.role === "teacher" ? eq(courses.teacherId, actorId) : eq(courses.schoolId, profile.user.schoolId);
  return db.select({ attempt: quizAttempts, exam: exams, course: courses, student: users }).from(quizAttempts).innerJoin(exams, eq(exams.id, quizAttempts.examId)).innerJoin(courses, eq(courses.id, exams.courseId)).innerJoin(users, eq(users.id, quizAttempts.studentId)).where(where).orderBy(desc(quizAttempts.submittedAt));
}

export async function reviewAssessmentAttempt(actorId: number, attemptId: number, feedback: string) {
  const db = requireDb(await getDb());
  const row = (await db.select({ attempt: quizAttempts, exam: exams }).from(quizAttempts).innerJoin(exams, eq(exams.id, quizAttempts.examId)).where(eq(quizAttempts.id, attemptId)).limit(1))[0];
  if (!row) throw new Error("Assessment attempt not found.");
  const { actor } = await requireCourseManager(actorId, row.exam.courseId);
  await db.update(quizAttempts).set({ feedback, reviewedBy: actorId, reviewedAt: new Date() }).where(eq(quizAttempts.id, attemptId));
  const preferences = await ensureNotificationPreferences(row.attempt.studentId);
  if (preferences.assessmentUpdatesEnabled) await db.insert(notifications).values({ recipientId: row.attempt.studentId, createdBy: actorId, title: "Assessment feedback available", body: "Your teacher has added feedback to an assessment attempt.", href: "/app#assessments" });
  await audit(actorId, actor.user.schoolId, "assessment.attempt.reviewed", "quizAttempt", String(attemptId));
  return { id: attemptId, reviewed: true as const };
}

export async function listTeacherRejectionFeedbackHistory(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "teacher" || !profile.user.schoolId) throw new Error("Only teachers can view their template review feedback.");
  const rows = await db.select({ id: teacherReminderTemplates.id, name: teacherReminderTemplates.name, note: teacherReminderTemplates.note, reviewNote: teacherReminderTemplates.reviewNote, reviewedAt: teacherReminderTemplates.reviewedAt, reviewedBy: teacherReminderTemplates.reviewedBy, submittedAt: teacherReminderTemplates.submittedAt }).from(teacherReminderTemplates).where(and(eq(teacherReminderTemplates.teacherId, userId), eq(teacherReminderTemplates.schoolId, profile.user.schoolId), eq(teacherReminderTemplates.sharingStatus, "rejected"))).orderBy(desc(teacherReminderTemplates.reviewedAt));
  const reviewerIds = Array.from(new Set(rows.map(row => row.reviewedBy).filter((id): id is number => Boolean(id))));
  const reviewers = reviewerIds.length ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, reviewerIds)) : [];
  const reviewerById = new Map(reviewers.map(reviewer => [reviewer.id, reviewer]));
  return rows.map(row => ({ ...row, reviewer: row.reviewedBy ? reviewerById.get(row.reviewedBy) ?? null : null }));
}

type ComparisonSharingActivityFilters = { ownerId?: number; action?: "shared" | "revoked" | "auto_revoked"; startAt?: Date; endAt?: Date };

export async function listAdminComparisonSharingActivity(userId: number, filters: ComparisonSharingActivityFilters = {}) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can view comparison sharing activity.");
  const actionMap = { shared: "admin.intervention-view.shared", revoked: "admin.intervention-view.share-revoked", auto_revoked: "admin.intervention-view.auto-revoked-expired" } as const;
  const actions = filters.action ? [actionMap[filters.action]] : Object.values(actionMap);
  const conditions = [eq(auditLogs.schoolId, profile.user.schoolId), eq(auditLogs.entityType, "adminInterventionComparisonView"), inArray(auditLogs.action, actions)];
  if (filters.startAt) conditions.push(gte(auditLogs.createdAt, filters.startAt));
  if (filters.endAt) conditions.push(lte(auditLogs.createdAt, filters.endAt));
  const events = await db.select({ id: auditLogs.id, action: auditLogs.action, entityId: auditLogs.entityId, actorId: auditLogs.actorId, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt }).from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt));
  const viewIds = Array.from(new Set(events.map(event => Number(event.entityId)).filter(id => Number.isInteger(id) && id > 0)));
  const views = viewIds.length ? await db.select({ id: adminInterventionComparisonViews.id, ownerId: adminInterventionComparisonViews.ownerId, name: adminInterventionComparisonViews.name, shareToken: adminInterventionComparisonViews.shareToken, shareExpiresAt: adminInterventionComparisonViews.shareExpiresAt, passwordProtected: sql<boolean>`${adminInterventionComparisonViews.sharePasswordHash} is not null` }).from(adminInterventionComparisonViews).where(and(eq(adminInterventionComparisonViews.schoolId, profile.user.schoolId), inArray(adminInterventionComparisonViews.id, viewIds))) : [];
  const viewById = new Map(views.map(view => [view.id, view]));
  const personIds = Array.from(new Set([...events.map(event => event.actorId), ...views.map(view => view.ownerId)].filter((id): id is number => Boolean(id))));
  const people = personIds.length ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, personIds)) : [];
  const personById = new Map(people.map(person => [person.id, person]));
  return events.map(event => { const view = viewById.get(Number(event.entityId)); const ownerId = view?.ownerId ?? event.actorId ?? null; return { ...event, view: view ? { id: view.id, name: view.name, shareActive: Boolean(view.shareToken), shareExpiresAt: view.shareExpiresAt, passwordProtected: view.passwordProtected } : null, owner: ownerId ? personById.get(ownerId) ?? null : null, actor: event.actorId ? personById.get(event.actorId) ?? null : null }; }).filter(event => !filters.ownerId || event.owner?.id === filters.ownerId);
}

type MonthlyComparisonReviewScheduleInput = { enabled: boolean; recipientIds: number[]; expiryWarningDays: number };

export async function getMonthlyComparisonReviewSchedule(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can manage monthly comparison reviews.");
  const schedule = (await db.select().from(monthlyComparisonReviewSchedules).where(eq(monthlyComparisonReviewSchedules.schoolId, profile.user.schoolId)).limit(1))[0];
  const admins = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(and(eq(users.schoolId, profile.user.schoolId), eq(users.role, "admin"))).orderBy(asc(users.name));
  return { schedule: schedule ?? null, admins };
}

export async function updateMonthlyComparisonReviewSchedule(userId: number, input: MonthlyComparisonReviewScheduleInput, sessionToken: string) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can manage monthly comparison reviews.");
  const recipientIds = Array.from(new Set(input.recipientIds));
  if (input.enabled && !recipientIds.length) throw new Error("Choose at least one administrator to receive the monthly review.");
  if (!Number.isInteger(input.expiryWarningDays) || input.expiryWarningDays < 1 || input.expiryWarningDays > 90) throw new Error("Choose an expiry warning window between 1 and 90 days.");
  const validRecipients = recipientIds.length ? await db.select({ id: users.id }).from(users).where(and(eq(users.schoolId, profile.user.schoolId), eq(users.role, "admin"), inArray(users.id, recipientIds))) : [];
  if (validRecipients.length !== recipientIds.length) throw new Error("Monthly review recipients must be active administrators in this school.");
  const current = (await db.select().from(monthlyComparisonReviewSchedules).where(eq(monthlyComparisonReviewSchedules.schoolId, profile.user.schoolId)).limit(1))[0];
  if (input.enabled && process.env.NODE_ENV !== "production") throw new Error("Publish the latest Educonnect release before activating monthly comparison review.");
  let scheduleCronTaskUid = current?.scheduleCronTaskUid ?? null;
  if (input.enabled) {
    const job = { cron: "0 30 9 1 * *", path: "/api/scheduled/monthly-comparison-review", payload: {}, description: `Educonnect monthly published comparison review for school ${profile.user.schoolId}` };
    const scheduled = scheduleCronTaskUid ? await updateHeartbeatJob(scheduleCronTaskUid, { ...job, enable: true }, sessionToken) : await createHeartbeatJob({ name: `educonnect-monthly-comparison-review-${profile.user.schoolId}`, ...job }, sessionToken);
    if (!scheduleCronTaskUid) scheduleCronTaskUid = (scheduled as { taskUid: string }).taskUid;
  } else if (scheduleCronTaskUid) await updateHeartbeatJob(scheduleCronTaskUid, { enable: false }, sessionToken);
  if (current) await db.update(monthlyComparisonReviewSchedules).set({ configuredBy: userId, recipientIds, enabled: input.enabled, expiryWarningDays: input.expiryWarningDays, scheduleCronTaskUid }).where(eq(monthlyComparisonReviewSchedules.id, current.id));
  else await db.insert(monthlyComparisonReviewSchedules).values({ schoolId: profile.user.schoolId, configuredBy: userId, recipientIds, enabled: input.enabled, expiryWarningDays: input.expiryWarningDays, scheduleCronTaskUid });
  await audit(userId, profile.user.schoolId, "admin.monthly-comparison-review.schedule-updated", "monthlyComparisonReviewSchedule", String(current?.id ?? profile.user.schoolId), { enabled: input.enabled, expiryWarningDays: input.expiryWarningDays, recipientCount: recipientIds.length });
  return getMonthlyComparisonReviewSchedule(userId);
}

export async function deliverScheduledMonthlyComparisonReview(taskUid: string) {
  const db = requireDb(await getDb());
  const schedule = (await db.select().from(monthlyComparisonReviewSchedules).where(eq(monthlyComparisonReviewSchedules.scheduleCronTaskUid, taskUid)).limit(1))[0];
  if (!schedule) return { ok: true, skipped: "orphan" as const };
  if (!schedule.enabled || !schedule.recipientIds.length) return { ok: true, skipped: "disabled" as const };
  const now = new Date();
  if (schedule.lastRunAt && schedule.lastRunAt.getUTCFullYear() === now.getUTCFullYear() && schedule.lastRunAt.getUTCMonth() === now.getUTCMonth()) return { ok: true, skipped: "already-reviewed" as const };
  const sharedViews = await db.select().from(adminInterventionComparisonViews).where(and(eq(adminInterventionComparisonViews.schoolId, schedule.schoolId), isNotNull(adminInterventionComparisonViews.shareToken)));
  const warningBoundary = new Date(now.getTime() + schedule.expiryWarningDays * 86_400_000);
  let revoked = 0; let active = 0; let expiring = 0; let protectedCount = 0; let unprotected = 0;
  for (const view of sharedViews) {
    const previousExpiry = view.shareExpiresAt;
    if (previousExpiry && previousExpiry <= now) {
      await db.update(adminInterventionComparisonViews).set({ shareToken: null, shareExpiresAt: null, sharePasswordHash: null, sharePasswordSalt: null }).where(eq(adminInterventionComparisonViews.id, view.id));
      await audit(schedule.configuredBy, schedule.schoolId, "admin.intervention-view.auto-revoked-expired", "adminInterventionComparisonView", String(view.id), { previousExpiry: previousExpiry.toISOString(), monthlyReviewScheduleId: schedule.id });
      revoked += 1;
      continue;
    }
    active += 1;
    if (previousExpiry && previousExpiry <= warningBoundary) expiring += 1;
    if (view.sharePasswordHash) protectedCount += 1; else unprotected += 1;
  }
  const summary = { active, expiring, protected: protectedCount, unprotected, revoked };
  const body = `Monthly published comparison review completed: ${active} active link${active === 1 ? "" : "s"}, ${expiring} expiring within ${schedule.expiryWarningDays} days, ${protectedCount} password-protected, ${unprotected} without a password, and ${revoked} expired link${revoked === 1 ? "" : "s"} automatically revoked.`;
  for (const recipientId of schedule.recipientIds) await createNotification(schedule.configuredBy, { recipientId, title: "Monthly comparison sharing review is ready", body, href: "/app#dashboard" });
  await db.update(monthlyComparisonReviewSchedules).set({ lastRunAt: now, lastReviewedCount: sharedViews.length, lastRevokedCount: revoked, lastSummary: summary }).where(eq(monthlyComparisonReviewSchedules.id, schedule.id));
  await audit(schedule.configuredBy, schedule.schoolId, "admin.monthly-comparison-review.delivered", "monthlyComparisonReviewSchedule", String(schedule.id), summary);
  return { ok: true, ...summary };
}

export async function getAdminComparisonSharingAuditSummary(userId: number, filters: ComparisonSharingActivityFilters = {}) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can view comparison sharing analytics.");
  const [events, schedule] = await Promise.all([
    listAdminComparisonSharingActivity(userId, filters),
    db.select({ expiryWarningDays: monthlyComparisonReviewSchedules.expiryWarningDays }).from(monthlyComparisonReviewSchedules).where(eq(monthlyComparisonReviewSchedules.schoolId, profile.user.schoolId)).limit(1),
  ]);
  const now = new Date();
  const warningBoundary = new Date(now.getTime() + (schedule[0]?.expiryWarningDays ?? 14) * 86_400_000);
  const activeViews = await db.select({ id: adminInterventionComparisonViews.id, shareExpiresAt: adminInterventionComparisonViews.shareExpiresAt, passwordProtected: sql<boolean>`${adminInterventionComparisonViews.sharePasswordHash} is not null` }).from(adminInterventionComparisonViews).where(and(eq(adminInterventionComparisonViews.schoolId, profile.user.schoolId), isNotNull(adminInterventionComparisonViews.shareToken)));
  const active = activeViews.filter(view => !view.shareExpiresAt || view.shareExpiresAt > now);
  return {
    activeLinks: active.length,
    expiringLinks: active.filter(view => Boolean(view.shareExpiresAt && view.shareExpiresAt <= warningBoundary)).length,
    passwordProtectedLinks: active.filter(view => view.passwordProtected).length,
    openLinks: active.filter(view => !view.passwordProtected).length,
    sharedEvents: events.filter(event => event.action === "admin.intervention-view.shared").length,
    manualRevocations: events.filter(event => event.action === "admin.intervention-view.share-revoked").length,
    automaticRevocations: events.filter(event => event.action === "admin.intervention-view.auto-revoked-expired").length,
    warningDays: schedule[0]?.expiryWarningDays ?? 14,
  };
}

export async function createAdminComparisonSharingAuditExport(userId: number, filters: ComparisonSharingActivityFilters = {}) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can export comparison sharing activity.");
  const events = await listAdminComparisonSharingActivity(userId, filters);
  const inserted = await db.insert(reportExports).values({ requestedBy: userId, type: "system", filterSnapshot: { report: "comparison_sharing_activity", generatedAt: new Date().toISOString(), ...filters }, status: "queued" });
  const exportId = Number(inserted[0].insertId);
  try {
    const actionLabel = (action: string) => action === "admin.intervention-view.shared" ? "shared" : action === "admin.intervention-view.auto-revoked-expired" ? "auto_revoked_expired" : "revoked";
    const rows = [["comparison_sharing_activity_audit"], ["generated_at", new Date().toISOString()], ["event_filter", filters.action ?? "all"], ["start_at", filters.startAt?.toISOString() ?? "all"], ["end_at", filters.endAt?.toISOString() ?? "all"], [""], ["event_id", "event", "comparison_view", "owner", "actor", "password_protected", "link_active", "expiry", "recorded_at"], ...events.map(event => [event.id, actionLabel(event.action), event.view?.name ?? "deleted comparison view", event.owner?.name ?? event.owner?.email ?? "", event.actor?.name ?? event.actor?.email ?? "", event.view?.passwordProtected ? "yes" : "no", event.view?.shareActive ? "yes" : "no", event.view?.shareExpiresAt?.toISOString() ?? "", event.createdAt.toISOString()])].map(row => row.map(csvEscape).join(",")).join("\n");
    const stored = await storagePut(`educonnect/exports/school-${profile.user.schoolId}/comparison-sharing-audit-${exportId}.csv`, `\uFEFF${rows}`, "text/csv;charset=utf-8");
    await db.update(reportExports).set({ storageKey: stored.key, status: "ready" }).where(eq(reportExports.id, exportId));
    await audit(userId, profile.user.schoolId, "admin.comparison-sharing-audit.exported", "reportExport", String(exportId), { eventCount: events.length, ...filters });
    return { id: exportId, url: stored.url, eventCount: events.length };
  } catch (error) {
    await db.update(reportExports).set({ status: "failed" }).where(eq(reportExports.id, exportId));
    throw error;
  }
}

function isComparisonSharingAuditExport(row: typeof reportExports.$inferSelect) {
  return row.type === "system" && row.filterSnapshot?.report === "comparison_sharing_activity";
}

type ComparisonSharingAuditExportHistoryFilters = { archived?: boolean; status?: "queued" | "ready" | "failed"; startAt?: Date; endAt?: Date };

export async function listAdminComparisonSharingAuditExports(userId: number, filters: ComparisonSharingAuditExportHistoryFilters = {}) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can review comparison sharing exports.");
  const adminIds = (await db.select({ id: users.id }).from(users).where(and(eq(users.schoolId, profile.user.schoolId), eq(users.role, "admin")))).map(row => row.id);
  if (!adminIds.length) return [];
  const rows = await db.select({ report: reportExports, requestedByName: users.name, requestedByEmail: users.email }).from(reportExports).innerJoin(users, eq(users.id, reportExports.requestedBy)).where(and(inArray(reportExports.requestedBy, adminIds), eq(reportExports.type, "system"), filters.archived ? isNotNull(reportExports.archivedAt) : isNull(reportExports.archivedAt), filters.status ? eq(reportExports.status, filters.status) : undefined, filters.startAt ? gte(reportExports.createdAt, filters.startAt) : undefined, filters.endAt ? lte(reportExports.createdAt, filters.endAt) : undefined)).orderBy(desc(reportExports.createdAt)).limit(60);
  return rows.filter(({ report }) => isComparisonSharingAuditExport(report)).map(({ report, requestedByName, requestedByEmail }) => ({ id: report.id, status: report.status, createdAt: report.createdAt, archivedAt: report.archivedAt, requestedBy: { name: requestedByName, email: requestedByEmail }, eventFilter: typeof report.filterSnapshot?.action === "string" ? report.filterSnapshot.action : "all", startAt: typeof report.filterSnapshot?.startAt === "string" ? report.filterSnapshot.startAt : null, endAt: typeof report.filterSnapshot?.endAt === "string" ? report.filterSnapshot.endAt : null, url: report.status === "ready" && report.storageKey ? `/manus-storage/${report.storageKey}` : null }));
}

export async function setAdminComparisonSharingAuditExportArchived(userId: number, exportId: number, archived: boolean) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can manage comparison sharing exports.");
  const found = (await db.select({ report: reportExports, schoolId: users.schoolId }).from(reportExports).innerJoin(users, eq(users.id, reportExports.requestedBy)).where(eq(reportExports.id, exportId)).limit(1))[0];
  if (!found || found.schoolId !== profile.user.schoolId || !isComparisonSharingAuditExport(found.report)) throw new Error("This comparison sharing export is not available in your school.");
  const archivedAt = archived ? new Date() : null;
  await db.update(reportExports).set({ archivedAt }).where(eq(reportExports.id, exportId));
  await audit(userId, profile.user.schoolId, archived ? "admin.comparison-sharing-audit.export-archived" : "admin.comparison-sharing-audit.export-restored", "reportExport", String(exportId), { requestedBy: found.report.requestedBy });
  return { id: exportId, archivedAt };
}

type ComparisonSharingExportRetentionInput = { enabled: boolean; retentionDays: 30 | 60 | 90 | 180 | 365 };

async function ensureComparisonSharingExportRetentionPolicy(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can manage comparison sharing export retention.");
  await db.insert(comparisonSharingExportRetentionPolicies).values({ schoolId: profile.user.schoolId, configuredBy: userId }).onDuplicateKeyUpdate({ set: { configuredBy: userId } });
  return (await db.select().from(comparisonSharingExportRetentionPolicies).where(eq(comparisonSharingExportRetentionPolicies.schoolId, profile.user.schoolId)).limit(1))[0]!;
}

export async function getComparisonSharingExportRetentionPolicy(userId: number) {
  return ensureComparisonSharingExportRetentionPolicy(userId);
}

export async function updateComparisonSharingExportRetentionPolicy(userId: number, input: ComparisonSharingExportRetentionInput, sessionToken: string) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can manage comparison sharing export retention.");
  const current = await ensureComparisonSharingExportRetentionPolicy(userId);
  if (input.enabled && process.env.NODE_ENV !== "production") throw new Error("Publish the latest Educonnect release before activating scheduled CSV retention.");
  let scheduleCronTaskUid = current.scheduleCronTaskUid;
  if (input.enabled) {
    const job = { cron: "0 0 4 * * *", path: "/api/scheduled/comparison-sharing-export-retention", payload: {}, description: `Educonnect comparison-sharing CSV retention for school ${profile.user.schoolId}; releases report references after ${input.retentionDays} days` };
    const schedule = scheduleCronTaskUid ? await updateHeartbeatJob(scheduleCronTaskUid, { ...job, enable: true }, sessionToken) : await createHeartbeatJob({ name: `educonnect-comparison-export-retention-${profile.user.schoolId}`, ...job }, sessionToken);
    if (!scheduleCronTaskUid) scheduleCronTaskUid = (schedule as { taskUid: string }).taskUid;
  } else if (scheduleCronTaskUid) await updateHeartbeatJob(scheduleCronTaskUid, { enable: false }, sessionToken);
  await db.update(comparisonSharingExportRetentionPolicies).set({ configuredBy: userId, enabled: input.enabled, retentionDays: input.retentionDays, scheduleCronTaskUid }).where(eq(comparisonSharingExportRetentionPolicies.id, current.id));
  await audit(userId, profile.user.schoolId, "admin.comparison-sharing-export-retention.updated", "comparisonSharingExportRetentionPolicy", String(current.id), { enabled: input.enabled, retentionDays: input.retentionDays });
  return getComparisonSharingExportRetentionPolicy(userId);
}

export async function cleanupExpiredComparisonSharingAuditExports(taskUid: string) {
  const db = requireDb(await getDb());
  const policy = (await db.select().from(comparisonSharingExportRetentionPolicies).where(eq(comparisonSharingExportRetentionPolicies.scheduleCronTaskUid, taskUid)).limit(1))[0];
  if (!policy) return { ok: true, skipped: "orphan" as const };
  if (!policy.enabled) return { ok: true, skipped: "disabled" as const };
  const startedAt = new Date();
  const inserted = await db.insert(comparisonSharingExportRetentionRuns).values({ policyId: policy.id, schoolId: policy.schoolId, taskUid, status: "running", startedAt });
  const runId = Number(inserted[0].insertId);
  try {
    const cutoff = new Date(Date.now() - policy.retentionDays * 86_400_000);
    const adminIds = (await db.select({ id: users.id }).from(users).where(and(eq(users.schoolId, policy.schoolId), eq(users.role, "admin")))).map(row => row.id);
    const candidates = adminIds.length ? await db.select({ report: reportExports }).from(reportExports).where(and(inArray(reportExports.requestedBy, adminIds), eq(reportExports.type, "system"), eq(reportExports.status, "ready"), lt(reportExports.createdAt, cutoff))) : [];
    const expiredIds = candidates.map(row => row.report).filter(isComparisonSharingAuditExport).map(report => report.id);
    if (expiredIds.length) await db.delete(reportExports).where(inArray(reportExports.id, expiredIds));
    const completedAt = new Date();
    await db.update(comparisonSharingExportRetentionRuns).set({ status: "completed", deletedCount: expiredIds.length, details: { retentionDays: policy.retentionDays, cutoff: cutoff.toISOString(), release: "database report records and storage key references" }, completedAt }).where(eq(comparisonSharingExportRetentionRuns.id, runId));
    await db.update(comparisonSharingExportRetentionPolicies).set({ lastCleanedAt: completedAt }).where(eq(comparisonSharingExportRetentionPolicies.id, policy.id));
    await audit(null, policy.schoolId, "admin.comparison-sharing-export-retention.cleaned", "comparisonSharingExportRetentionPolicy", String(policy.id), { taskUid, deletedCount: expiredIds.length, retentionDays: policy.retentionDays, runId });
    return { ok: true, deletedCount: expiredIds.length, runId };
  } catch (error) {
    await db.update(comparisonSharingExportRetentionRuns).set({ status: "failed", details: { message: error instanceof Error ? error.message : String(error) }, completedAt: new Date() }).where(eq(comparisonSharingExportRetentionRuns.id, runId));
    throw error;
  }
}

export async function listComparisonSharingExportRetentionRuns(userId: number) {
  const db = requireDb(await getDb());
  const profile = await getWorkspace(userId);
  if (profile.user.role !== "admin" || !profile.user.schoolId) throw new Error("Only administrators can review comparison sharing export retention runs.");
  return db.select().from(comparisonSharingExportRetentionRuns).where(eq(comparisonSharingExportRetentionRuns.schoolId, profile.user.schoolId)).orderBy(desc(comparisonSharingExportRetentionRuns.startedAt)).limit(30);
}
