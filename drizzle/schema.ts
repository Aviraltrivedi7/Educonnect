import {
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** The framework's `user` role is Educonnect's student role. */
export const userRoles = ["user", "teacher", "admin"] as const;

export const schools = mysqlTable("schools", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    schoolId: int("schoolId").references(() => schools.id),
    name: varchar("name", { length: 180 }),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: mysqlEnum("role", userRoles).default("user").notNull(),
    profileComplete: boolean("profileComplete").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => [index("users_school_idx").on(table.schoolId), index("users_role_idx").on(table.role)],
);

export const notificationPreferences = mysqlTable(
  "notificationPreferences",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    staffUpdatesEnabled: boolean("staffUpdatesEnabled").notNull().default(true),
    gradeUpdatesEnabled: boolean("gradeUpdatesEnabled").notNull().default(true),
    assessmentUpdatesEnabled: boolean("assessmentUpdatesEnabled").notNull().default(true),
    learningRemindersEnabled: boolean("learningRemindersEnabled").notNull().default(true),
    emailDeliveryEnabled: boolean("emailDeliveryEnabled").notNull().default(false),
    pushDeliveryEnabled: boolean("pushDeliveryEnabled").notNull().default(false),
    reminderEnabled: boolean("reminderEnabled").notNull().default(false),
    reminderTimeUtc: varchar("reminderTimeUtc", { length: 5 }).notNull().default("09:00"),
    reminderTimezone: varchar("reminderTimezone", { length: 64 }).notNull().default("UTC"),
    reminderWeekdaysOnly: boolean("reminderWeekdaysOnly").notNull().default(true),
    reminderScheduleCronTaskUid: varchar("reminderScheduleCronTaskUid", { length: 65 }),
    reminderNextExecutionAt: timestamp("reminderNextExecutionAt"),
    reminderLastSentAt: timestamp("reminderLastSentAt"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("notification_preferences_user_unq").on(table.userId), index("notification_preferences_cron_idx").on(table.reminderScheduleCronTaskUid)],
);

export const activityFilterPresets = mysqlTable(
  "activityFilterPresets",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    schoolId: int("schoolId").notNull().references(() => schools.id),
    name: varchar("name", { length: 80 }).notNull(),
    courseId: int("courseId"),
    subject: varchar("subject", { length: 120 }),
    classSection: varchar("classSection", { length: 120 }),
    startDate: varchar("startDate", { length: 10 }),
    endDate: varchar("endDate", { length: 10 }),
    tags: json("tags").$type<string[]>().notNull(),
    isDefault: boolean("isDefault").notNull().default(false),
    isShared: boolean("isShared").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("activity_filter_preset_user_name_unq").on(table.userId, table.name), index("activity_filter_preset_user_idx").on(table.userId), index("activity_filter_preset_school_shared_idx").on(table.schoolId, table.isShared)],
);

export const teacherReminderTemplateSharingStatuses = ["draft", "pending", "approved", "rejected"] as const;

export const teacherReminderTemplates = mysqlTable(
  "teacherReminderTemplates",
  {
    id: int("id").autoincrement().primaryKey(),
    teacherId: int("teacherId").notNull().references(() => users.id),
    schoolId: int("schoolId").notNull().references(() => schools.id),
    name: varchar("name", { length: 80 }).notNull(),
    note: varchar("note", { length: 500 }).notNull(),
    isShared: boolean("isShared").notNull().default(false),
    sharingStatus: mysqlEnum("sharingStatus", teacherReminderTemplateSharingStatuses).notNull().default("draft"),
    submittedAt: timestamp("submittedAt"),
    reviewedAt: timestamp("reviewedAt"),
    reviewedBy: int("reviewedBy").references(() => users.id),
    reviewNote: varchar("reviewNote", { length: 300 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("teacher_reminder_template_user_name_unq").on(table.teacherId, table.name), index("teacher_reminder_template_user_idx").on(table.teacherId, table.updatedAt), index("teacher_reminder_template_school_shared_idx").on(table.schoolId, table.isShared), index("teacher_reminder_template_school_status_idx").on(table.schoolId, table.sharingStatus)],
);

export const adminInterventionComparisonViews = mysqlTable(
  "adminInterventionComparisonViews",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id),
    schoolId: int("schoolId").notNull().references(() => schools.id),
    name: varchar("name", { length: 80 }).notNull(),
    courseId: int("courseId").references(() => courses.id),
    classSection: varchar("classSection", { length: 120 }),
    startAt: timestamp("startAt"),
    endAt: timestamp("endAt"),
    comparisonCourseId: int("comparisonCourseId").references(() => courses.id),
    comparisonClassSection: varchar("comparisonClassSection", { length: 120 }),
    normalized: boolean("normalized").notNull().default(false),
    shareToken: varchar("shareToken", { length: 96 }).unique(),
    shareExpiresAt: timestamp("shareExpiresAt"),
    sharePasswordHash: varchar("sharePasswordHash", { length: 128 }),
    sharePasswordSalt: varchar("sharePasswordSalt", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("admin_intervention_view_owner_name_unq").on(table.ownerId, table.name), index("admin_intervention_view_school_owner_idx").on(table.schoolId, table.ownerId, table.updatedAt)],
);

export const monthlyCertificateAuditReportSchedules = mysqlTable(
  "monthlyCertificateAuditReportSchedules",
  {
    id: int("id").autoincrement().primaryKey(),
    schoolId: int("schoolId").notNull().references(() => schools.id),
    configuredBy: int("configuredBy").notNull().references(() => users.id),
    recipientIds: json("recipientIds").$type<number[]>().notNull(),
    enabled: boolean("enabled").notNull().default(false),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    lastRunAt: timestamp("lastRunAt"),
    lastReportExportId: int("lastReportExportId").references(() => reportExports.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("monthly_certificate_audit_school_unq").on(table.schoolId), index("monthly_certificate_audit_task_idx").on(table.scheduleCronTaskUid)],
);

export const monthlyComparisonReviewSchedules = mysqlTable(
  "monthlyComparisonReviewSchedules",
  {
    id: int("id").autoincrement().primaryKey(),
    schoolId: int("schoolId").notNull().references(() => schools.id),
    configuredBy: int("configuredBy").notNull().references(() => users.id),
    recipientIds: json("recipientIds").$type<number[]>().notNull(),
    enabled: boolean("enabled").notNull().default(false),
    expiryWarningDays: int("expiryWarningDays").notNull().default(14),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    lastRunAt: timestamp("lastRunAt"),
    lastReviewedCount: int("lastReviewedCount").notNull().default(0),
    lastRevokedCount: int("lastRevokedCount").notNull().default(0),
    lastSummary: json("lastSummary").$type<{ active: number; expiring: number; protected: number; unprotected: number; revoked: number }>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("monthly_comparison_review_school_unq").on(table.schoolId), index("monthly_comparison_review_task_idx").on(table.scheduleCronTaskUid)],
);

export const trendExportDownloads = mysqlTable(
  "trendExportDownloads",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    weekCount: int("weekCount").notNull(),
    rowCount: int("rowCount").notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    archivedAt: timestamp("archivedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("trend_export_user_time_idx").on(table.userId, table.createdAt), index("trend_export_user_id_idx").on(table.userId, table.id)],
);

export const trendExportRetentionPolicies = mysqlTable(
  "trendExportRetentionPolicies",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    retentionDays: int("retentionDays").notNull().default(30),
    enabled: boolean("enabled").notNull().default(false),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    lastCleanedAt: timestamp("lastCleanedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("trend_retention_user_unq").on(table.userId), index("trend_retention_task_idx").on(table.scheduleCronTaskUid)],
);

export const trendExportRetentionRuns = mysqlTable(
  "trendExportRetentionRuns",
  {
    id: int("id").autoincrement().primaryKey(),
    policyId: int("policyId").notNull().references(() => trendExportRetentionPolicies.id),
    userId: int("userId").notNull().references(() => users.id),
    taskUid: varchar("taskUid", { length: 65 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    deletedCount: int("deletedCount").notNull().default(0),
    details: json("details"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => [index("trend_retention_run_user_idx").on(table.userId, table.startedAt), index("trend_retention_run_policy_idx").on(table.policyId, table.startedAt)],
);

export const activityFilterPresetFavoriteFolders = mysqlTable(
  "activityFilterPresetFavoriteFolders",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    name: varchar("name", { length: 60 }).notNull(),
    position: int("position").notNull().default(0),
    color: varchar("color", { length: 16 }).notNull().default("#52749a"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("activity_favorite_folder_user_name_unq").on(table.userId, table.name), index("activity_favorite_folder_user_idx").on(table.userId)],
);

export const activityFilterPresetFavorites = mysqlTable(
  "activityFilterPresetFavorites",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    presetId: int("presetId").notNull().references(() => activityFilterPresets.id),
    folderId: int("folderId").references(() => activityFilterPresetFavoriteFolders.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("activity_filter_favorite_user_preset_unq").on(table.userId, table.presetId), index("activity_filter_favorite_preset_idx").on(table.presetId)],
);

export const schoolInvites = mysqlTable(
  "schoolInvites",
  {
    id: int("id").autoincrement().primaryKey(),
    schoolId: int("schoolId").notNull().references(() => schools.id),
    createdBy: int("createdBy").notNull().references(() => users.id),
    code: varchar("code", { length: 48 }).notNull().unique(),
    role: mysqlEnum("role", userRoles).notNull().default("user"),
    expiresAt: timestamp("expiresAt").notNull(),
    acceptedBy: int("acceptedBy").references(() => users.id),
    acceptedAt: timestamp("acceptedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("school_invites_school_idx").on(table.schoolId, table.expiresAt), index("school_invites_code_idx").on(table.code)],
);

export const courses = mysqlTable(
  "courses",
  {
    id: int("id").autoincrement().primaryKey(),
    schoolId: int("schoolId").notNull().references(() => schools.id),
    teacherId: int("teacherId").notNull().references(() => users.id),
    code: varchar("code", { length: 32 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    subject: varchar("subject", { length: 120 }),
    classSection: varchar("classSection", { length: 120 }),
    description: text("description"),
    coverImageUrl: varchar("coverImageUrl", { length: 2048 }),
    status: mysqlEnum("status", ["draft", "published", "archived"]).notNull().default("draft"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("course_school_code_unq").on(table.schoolId, table.code), index("courses_teacher_idx").on(table.teacherId)],
);

export const courseModules = mysqlTable(
  "courseModules",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId").notNull().references(() => courses.id),
    title: varchar("title", { length: 180 }).notNull(),
    position: int("position").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("modules_course_idx").on(table.courseId)],
);

export const lessons = mysqlTable(
  "lessons",
  {
    id: int("id").autoincrement().primaryKey(),
    moduleId: int("moduleId").notNull().references(() => courseModules.id),
    title: varchar("title", { length: 180 }).notNull(),
    content: text("content"),
    videoUrl: varchar("videoUrl", { length: 2048 }),
    resourceUrl: varchar("resourceUrl", { length: 2048 }),
    durationMinutes: int("durationMinutes").notNull().default(0),
    position: int("position").notNull().default(0),
    isPublished: boolean("isPublished").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("lessons_module_idx").on(table.moduleId)],
);

export const enrollments = mysqlTable(
  "enrollments",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId").notNull().references(() => courses.id),
    studentId: int("studentId").notNull().references(() => users.id),
    status: mysqlEnum("status", ["active", "completed", "withdrawn"]).notNull().default("active"),
    enrolledAt: timestamp("enrolledAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => [uniqueIndex("enrollment_course_student_unq").on(table.courseId, table.studentId), index("enrollment_student_idx").on(table.studentId)],
);

export const lessonProgress = mysqlTable(
  "lessonProgress",
  {
    id: int("id").autoincrement().primaryKey(),
    lessonId: int("lessonId").notNull().references(() => lessons.id),
    studentId: int("studentId").notNull().references(() => users.id),
    resumeSecond: int("resumeSecond").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completedAt"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("progress_lesson_student_unq").on(table.lessonId, table.studentId), index("progress_student_idx").on(table.studentId)],
);

export const studentEngagementDays = mysqlTable(
  "studentEngagementDays",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId").notNull().references(() => users.id),
    activityDate: varchar("activityDate", { length: 10 }).notNull(),
    activityCount: int("activityCount").notNull().default(1),
    firstActivityAt: timestamp("firstActivityAt").defaultNow().notNull(),
    lastActivityAt: timestamp("lastActivityAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("engagement_student_date_unq").on(table.studentId, table.activityDate), index("engagement_student_date_idx").on(table.studentId, table.activityDate)],
);

export const studentAchievementCertificates = mysqlTable(
  "studentAchievementCertificates",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId").notNull().references(() => users.id),
    milestoneId: varchar("milestoneId", { length: 64 }).notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    verificationToken: varchar("verificationToken", { length: 96 }),
    revokedAt: timestamp("revokedAt"),
    revokedBy: int("revokedBy").references(() => users.id),
    revocationReason: varchar("revocationReason", { length: 300 }),
    issuedAt: timestamp("issuedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("certificate_student_milestone_unq").on(table.studentId, table.milestoneId), uniqueIndex("certificate_verification_token_unq").on(table.verificationToken), index("certificate_student_issued_idx").on(table.studentId, table.issuedAt)],
);

export const assignments = mysqlTable(
  "assignments",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId").notNull().references(() => courses.id),
    authorId: int("authorId").notNull().references(() => users.id),
    title: varchar("title", { length: 180 }).notNull(),
    instructions: text("instructions").notNull(),
    dueAt: timestamp("dueAt"),
    maxPoints: int("maxPoints").notNull().default(100),
    status: mysqlEnum("status", ["draft", "published", "closed"]).notNull().default("draft"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("assignments_course_idx").on(table.courseId), index("assignments_due_idx").on(table.dueAt)],
);

export const submissions = mysqlTable(
  "submissions",
  {
    id: int("id").autoincrement().primaryKey(),
    assignmentId: int("assignmentId").notNull().references(() => assignments.id),
    studentId: int("studentId").notNull().references(() => users.id),
    body: text("body"),
    attachmentUrl: varchar("attachmentUrl", { length: 2048 }),
    submittedAt: timestamp("submittedAt"),
    score: int("score"),
    feedback: text("feedback"),
    gradedBy: int("gradedBy").references(() => users.id),
    gradedAt: timestamp("gradedAt"),
    status: mysqlEnum("status", ["draft", "submitted", "graded", "returned"]).notNull().default("draft"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("submission_assignment_student_unq").on(table.assignmentId, table.studentId), index("submissions_student_idx").on(table.studentId)],
);

export const exams = mysqlTable(
  "exams",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId").notNull().references(() => courses.id),
    authorId: int("authorId").notNull().references(() => users.id),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    availableFrom: timestamp("availableFrom"),
    availableUntil: timestamp("availableUntil"),
    durationMinutes: int("durationMinutes").notNull().default(30),
    status: mysqlEnum("status", ["draft", "published", "closed"]).notNull().default("draft"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("exams_course_idx").on(table.courseId)],
);

export const examQuestions = mysqlTable(
  "examQuestions",
  {
    id: int("id").autoincrement().primaryKey(),
    examId: int("examId").notNull().references(() => exams.id),
    prompt: text("prompt").notNull(),
    type: mysqlEnum("type", ["multiple_choice", "short_answer"]).notNull(),
    options: json("options").$type<string[]>(),
    answerKey: text("answerKey"),
    points: int("points").notNull().default(1),
    position: int("position").notNull().default(0),
  },
  table => [index("questions_exam_idx").on(table.examId)],
);

export const quizAttempts = mysqlTable(
  "quizAttempts",
  {
    id: int("id").autoincrement().primaryKey(),
    examId: int("examId").notNull().references(() => exams.id),
    studentId: int("studentId").notNull().references(() => users.id),
    answers: json("answers").$type<Record<string, string>>(),
    score: int("score"),
    feedback: text("feedback"),
    reviewedBy: int("reviewedBy").references(() => users.id),
    reviewedAt: timestamp("reviewedAt"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    submittedAt: timestamp("submittedAt"),
  },
  table => [index("attempt_exam_student_idx").on(table.examId, table.studentId)],
);

export const mistakeEntries = mysqlTable(
  "mistakeEntries",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId").notNull().references(() => users.id),
    courseId: int("courseId").references(() => courses.id),
    topic: varchar("topic", { length: 180 }).notNull(),
    reflection: text("reflection").notNull(),
    nextStep: text("nextStep"),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("mistakes_student_idx").on(table.studentId)],
);

export const scheduleEvents = mysqlTable(
  "scheduleEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    schoolId: int("schoolId").notNull().references(() => schools.id),
    courseId: int("courseId").references(() => courses.id),
    ownerId: int("ownerId").notNull().references(() => users.id),
    title: varchar("title", { length: 180 }).notNull(),
    startsAt: timestamp("startsAt").notNull(),
    endsAt: timestamp("endsAt").notNull(),
    location: varchar("location", { length: 200 }),
    audience: mysqlEnum("audience", ["school", "course", "personal"]).notNull().default("personal"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("schedule_owner_time_idx").on(table.ownerId, table.startsAt), index("schedule_course_idx").on(table.courseId)],
);

export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  schoolId: int("schoolId").notNull().references(() => schools.id),
  subject: varchar("subject", { length: 180 }).notNull(),
  createdBy: int("createdBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const conversationParticipants = mysqlTable(
  "conversationParticipants",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId").notNull().references(() => conversations.id),
    userId: int("userId").notNull().references(() => users.id),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
    lastReadAt: timestamp("lastReadAt"),
  },
  table => [uniqueIndex("conversation_participant_unq").on(table.conversationId, table.userId), index("participant_user_idx").on(table.userId)],
);

export const messages = mysqlTable(
  "messages",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId").notNull().references(() => conversations.id),
    senderId: int("senderId").notNull().references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("messages_conversation_idx").on(table.conversationId, table.createdAt)],
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    recipientId: int("recipientId").notNull().references(() => users.id),
    createdBy: int("createdBy").references(() => users.id),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    href: varchar("href", { length: 500 }),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("notification_recipient_idx").on(table.recipientId, table.readAt)],
);

export const auditLogs = mysqlTable(
  "auditLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    actorId: int("actorId").references(() => users.id),
    schoolId: int("schoolId").references(() => schools.id),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    entityId: varchar("entityId", { length: 80 }),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("audit_school_time_idx").on(table.schoolId, table.createdAt), index("audit_actor_idx").on(table.actorId)],
);

export const reportExports = mysqlTable(
  "reportExports",
  {
    id: int("id").autoincrement().primaryKey(),
    requestedBy: int("requestedBy").notNull().references(() => users.id),
    type: mysqlEnum("type", ["course", "user", "performance", "system", "intervention", "certificate_revocation"]).notNull(),
    filterSnapshot: json("filterSnapshot").$type<Record<string, unknown>>(),
    storageKey: varchar("storageKey", { length: 512 }),
    status: mysqlEnum("status", ["queued", "ready", "failed"]).notNull().default("queued"),
    archivedAt: timestamp("archivedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("exports_requester_idx").on(table.requestedBy, table.createdAt), index("exports_archived_idx").on(table.archivedAt, table.createdAt)],
);

export const backupJobs = mysqlTable(
  "backupJobs",
  {
    id: int("id").autoincrement().primaryKey(),
    requestedBy: int("requestedBy").notNull().references(() => users.id),
    storageKey: varchar("storageKey", { length: 512 }),
    status: mysqlEnum("status", ["queued", "running", "completed", "failed"]).notNull().default("queued"),
    errorMessage: text("errorMessage"),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("backup_status_time_idx").on(table.status, table.createdAt)],
);

export const aiRuns = mysqlTable(
  "aiRuns",
  {
    id: int("id").autoincrement().primaryKey(),
    requestedBy: int("requestedBy").notNull().references(() => users.id),
    feature: mysqlEnum("feature", ["study_plan", "feedback_draft", "career_guidance"]).notNull(),
    promptVersion: varchar("promptVersion", { length: 64 }).notNull(),
    inputSummary: text("inputSummary").notNull(),
    outputSummary: text("outputSummary"),
    reviewStatus: mysqlEnum("reviewStatus", ["pending", "accepted", "rejected"]).notNull().default("pending"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("ai_requested_feature_idx").on(table.requestedBy, table.feature, table.createdAt)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
