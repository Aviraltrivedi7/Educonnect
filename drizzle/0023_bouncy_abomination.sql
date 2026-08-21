CREATE TABLE `adminInterventionComparisonViews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`schoolId` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`courseId` int,
	`classSection` varchar(120),
	`startAt` timestamp,
	`endAt` timestamp,
	`comparisonCourseId` int,
	`comparisonClassSection` varchar(120),
	`normalized` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `adminInterventionComparisonViews_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_intervention_view_owner_name_unq` UNIQUE(`ownerId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `teacherReminderTemplates` ADD `sharingStatus` enum('draft','pending','approved','rejected') DEFAULT 'draft' NOT NULL;--> statement-breakpoint
UPDATE `teacherReminderTemplates` SET `sharingStatus` = 'approved' WHERE `isShared` = true;--> statement-breakpoint
ALTER TABLE `teacherReminderTemplates` ADD `submittedAt` timestamp;--> statement-breakpoint
ALTER TABLE `teacherReminderTemplates` ADD `reviewedAt` timestamp;--> statement-breakpoint
ALTER TABLE `teacherReminderTemplates` ADD `reviewedBy` int;--> statement-breakpoint
ALTER TABLE `teacherReminderTemplates` ADD `reviewNote` varchar(300);--> statement-breakpoint
ALTER TABLE `adminInterventionComparisonViews` ADD CONSTRAINT `adminInterventionComparisonViews_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `adminInterventionComparisonViews` ADD CONSTRAINT `adminInterventionComparisonViews_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `adminInterventionComparisonViews` ADD CONSTRAINT `adminInterventionComparisonViews_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `adminInterventionComparisonViews` ADD CONSTRAINT `admin_intervention_view_comp_course_fk` FOREIGN KEY (`comparisonCourseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `admin_intervention_view_school_owner_idx` ON `adminInterventionComparisonViews` (`schoolId`,`ownerId`,`updatedAt`);--> statement-breakpoint
ALTER TABLE `teacherReminderTemplates` ADD CONSTRAINT `teacher_reminder_template_reviewed_by_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `teacher_reminder_template_school_status_idx` ON `teacherReminderTemplates` (`schoolId`,`sharingStatus`);
