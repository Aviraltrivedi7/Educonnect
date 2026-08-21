CREATE TABLE `teacherReminderTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teacherId` int NOT NULL,
	`schoolId` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`note` varchar(500) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teacherReminderTemplates_id` PRIMARY KEY(`id`),
	CONSTRAINT `teacher_reminder_template_user_name_unq` UNIQUE(`teacherId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `studentAchievementCertificates` ADD `verificationToken` varchar(96);--> statement-breakpoint
ALTER TABLE `studentAchievementCertificates` ADD CONSTRAINT `certificate_verification_token_unq` UNIQUE(`verificationToken`);--> statement-breakpoint
ALTER TABLE `teacherReminderTemplates` ADD CONSTRAINT `teacherReminderTemplates_teacherId_users_id_fk` FOREIGN KEY (`teacherId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teacherReminderTemplates` ADD CONSTRAINT `teacherReminderTemplates_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `teacher_reminder_template_user_idx` ON `teacherReminderTemplates` (`teacherId`,`updatedAt`);