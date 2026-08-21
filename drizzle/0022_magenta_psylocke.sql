ALTER TABLE `studentAchievementCertificates` ADD `revokedAt` timestamp;--> statement-breakpoint
ALTER TABLE `studentAchievementCertificates` ADD `revokedBy` int;--> statement-breakpoint
ALTER TABLE `studentAchievementCertificates` ADD `revocationReason` varchar(300);--> statement-breakpoint
ALTER TABLE `teacherReminderTemplates` ADD `isShared` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `studentAchievementCertificates` ADD CONSTRAINT `studentAchievementCertificates_revokedBy_users_id_fk` FOREIGN KEY (`revokedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `teacher_reminder_template_school_shared_idx` ON `teacherReminderTemplates` (`schoolId`,`isShared`);