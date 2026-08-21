CREATE TABLE `aiRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestedBy` int NOT NULL,
	`feature` enum('study_plan','feedback_draft','career_guidance') NOT NULL,
	`promptVersion` varchar(64) NOT NULL,
	`inputSummary` text NOT NULL,
	`outputSummary` text,
	`reviewStatus` enum('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`authorId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`instructions` text NOT NULL,
	`dueAt` timestamp,
	`maxPoints` int NOT NULL DEFAULT 100,
	`status` enum('draft','published','closed') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int,
	`schoolId` int,
	`action` varchar(120) NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`entityId` varchar(80),
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `backupJobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestedBy` int NOT NULL,
	`storageKey` varchar(512),
	`status` enum('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
	`errorMessage` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `backupJobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`schoolId` int NOT NULL,
	`subject` varchar(180) NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `courseModules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `courseModules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`schoolId` int NOT NULL,
	`teacherId` int NOT NULL,
	`code` varchar(32) NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text,
	`coverImageUrl` varchar(2048),
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courses_id` PRIMARY KEY(`id`),
	CONSTRAINT `course_school_code_unq` UNIQUE(`schoolId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `enrollments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`studentId` int NOT NULL,
	`status` enum('active','completed','withdrawn') NOT NULL DEFAULT 'active',
	`enrolledAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `enrollments_id` PRIMARY KEY(`id`),
	CONSTRAINT `enrollment_course_student_unq` UNIQUE(`courseId`,`studentId`)
);
--> statement-breakpoint
CREATE TABLE `examQuestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`examId` int NOT NULL,
	`prompt` text NOT NULL,
	`type` enum('multiple_choice','short_answer') NOT NULL,
	`options` json,
	`answerKey` text,
	`points` int NOT NULL DEFAULT 1,
	`position` int NOT NULL DEFAULT 0,
	CONSTRAINT `examQuestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`authorId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text,
	`availableFrom` timestamp,
	`availableUntil` timestamp,
	`durationMinutes` int NOT NULL DEFAULT 30,
	`status` enum('draft','published','closed') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lessonProgress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lessonId` int NOT NULL,
	`studentId` int NOT NULL,
	`resumeSecond` int NOT NULL DEFAULT 0,
	`completed` boolean NOT NULL DEFAULT false,
	`completedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lessonProgress_id` PRIMARY KEY(`id`),
	CONSTRAINT `progress_lesson_student_unq` UNIQUE(`lessonId`,`studentId`)
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`moduleId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`content` text,
	`videoUrl` varchar(2048),
	`resourceUrl` varchar(2048),
	`durationMinutes` int NOT NULL DEFAULT 0,
	`position` int NOT NULL DEFAULT 0,
	`isPublished` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lessons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`senderId` int NOT NULL,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mistakeEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`courseId` int,
	`topic` varchar(180) NOT NULL,
	`reflection` text NOT NULL,
	`nextStep` text,
	`resolved` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mistakeEntries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipientId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`body` text NOT NULL,
	`href` varchar(500),
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quizAttempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`examId` int NOT NULL,
	`studentId` int NOT NULL,
	`answers` json,
	`score` int,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`submittedAt` timestamp,
	CONSTRAINT `quizAttempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reportExports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestedBy` int NOT NULL,
	`type` enum('course','user','performance','system') NOT NULL,
	`filterSnapshot` json,
	`storageKey` varchar(512),
	`status` enum('queued','ready','failed') NOT NULL DEFAULT 'queued',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reportExports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scheduleEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`schoolId` int NOT NULL,
	`courseId` int,
	`ownerId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`location` varchar(200),
	`audience` enum('school','course','personal') NOT NULL DEFAULT 'personal',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scheduleEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`timezone` varchar(64) NOT NULL DEFAULT 'UTC',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schools_id` PRIMARY KEY(`id`),
	CONSTRAINT `schools_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assignmentId` int NOT NULL,
	`studentId` int NOT NULL,
	`body` text,
	`attachmentUrl` varchar(2048),
	`submittedAt` timestamp,
	`score` int,
	`feedback` text,
	`gradedBy` int,
	`gradedAt` timestamp,
	`status` enum('draft','submitted','graded','returned') NOT NULL DEFAULT 'draft',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `submission_assignment_student_unq` UNIQUE(`assignmentId`,`studentId`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`schoolId` int,
	`name` varchar(180),
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('student','teacher','admin') NOT NULL DEFAULT 'student',
	`profileComplete` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
ALTER TABLE `aiRuns` ADD CONSTRAINT `aiRuns_requestedBy_users_id_fk` FOREIGN KEY (`requestedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditLogs` ADD CONSTRAINT `auditLogs_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditLogs` ADD CONSTRAINT `auditLogs_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `backupJobs` ADD CONSTRAINT `backupJobs_requestedBy_users_id_fk` FOREIGN KEY (`requestedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courseModules` ADD CONSTRAINT `courseModules_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courses` ADD CONSTRAINT `courses_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courses` ADD CONSTRAINT `courses_teacherId_users_id_fk` FOREIGN KEY (`teacherId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_studentId_users_id_fk` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `examQuestions` ADD CONSTRAINT `examQuestions_examId_exams_id_fk` FOREIGN KEY (`examId`) REFERENCES `exams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exams` ADD CONSTRAINT `exams_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exams` ADD CONSTRAINT `exams_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lessonProgress` ADD CONSTRAINT `lessonProgress_lessonId_lessons_id_fk` FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lessonProgress` ADD CONSTRAINT `lessonProgress_studentId_users_id_fk` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_moduleId_courseModules_id_fk` FOREIGN KEY (`moduleId`) REFERENCES `courseModules`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversationId_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_senderId_users_id_fk` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mistakeEntries` ADD CONSTRAINT `mistakeEntries_studentId_users_id_fk` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mistakeEntries` ADD CONSTRAINT `mistakeEntries_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_recipientId_users_id_fk` FOREIGN KEY (`recipientId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quizAttempts` ADD CONSTRAINT `quizAttempts_examId_exams_id_fk` FOREIGN KEY (`examId`) REFERENCES `exams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quizAttempts` ADD CONSTRAINT `quizAttempts_studentId_users_id_fk` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reportExports` ADD CONSTRAINT `reportExports_requestedBy_users_id_fk` FOREIGN KEY (`requestedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scheduleEvents` ADD CONSTRAINT `scheduleEvents_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scheduleEvents` ADD CONSTRAINT `scheduleEvents_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scheduleEvents` ADD CONSTRAINT `scheduleEvents_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_assignmentId_assignments_id_fk` FOREIGN KEY (`assignmentId`) REFERENCES `assignments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_studentId_users_id_fk` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_gradedBy_users_id_fk` FOREIGN KEY (`gradedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ai_requested_feature_idx` ON `aiRuns` (`requestedBy`,`feature`,`createdAt`);--> statement-breakpoint
CREATE INDEX `assignments_course_idx` ON `assignments` (`courseId`);--> statement-breakpoint
CREATE INDEX `assignments_due_idx` ON `assignments` (`dueAt`);--> statement-breakpoint
CREATE INDEX `audit_school_time_idx` ON `auditLogs` (`schoolId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `auditLogs` (`actorId`);--> statement-breakpoint
CREATE INDEX `backup_status_time_idx` ON `backupJobs` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `modules_course_idx` ON `courseModules` (`courseId`);--> statement-breakpoint
CREATE INDEX `courses_teacher_idx` ON `courses` (`teacherId`);--> statement-breakpoint
CREATE INDEX `enrollment_student_idx` ON `enrollments` (`studentId`);--> statement-breakpoint
CREATE INDEX `questions_exam_idx` ON `examQuestions` (`examId`);--> statement-breakpoint
CREATE INDEX `exams_course_idx` ON `exams` (`courseId`);--> statement-breakpoint
CREATE INDEX `progress_student_idx` ON `lessonProgress` (`studentId`);--> statement-breakpoint
CREATE INDEX `lessons_module_idx` ON `lessons` (`moduleId`);--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `mistakes_student_idx` ON `mistakeEntries` (`studentId`);--> statement-breakpoint
CREATE INDEX `notification_recipient_idx` ON `notifications` (`recipientId`,`readAt`);--> statement-breakpoint
CREATE INDEX `attempt_exam_student_idx` ON `quizAttempts` (`examId`,`studentId`);--> statement-breakpoint
CREATE INDEX `exports_requester_idx` ON `reportExports` (`requestedBy`,`createdAt`);--> statement-breakpoint
CREATE INDEX `schedule_owner_time_idx` ON `scheduleEvents` (`ownerId`,`startsAt`);--> statement-breakpoint
CREATE INDEX `schedule_course_idx` ON `scheduleEvents` (`courseId`);--> statement-breakpoint
CREATE INDEX `submissions_student_idx` ON `submissions` (`studentId`);--> statement-breakpoint
CREATE INDEX `users_school_idx` ON `users` (`schoolId`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);