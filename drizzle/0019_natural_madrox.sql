CREATE TABLE `studentEngagementDays` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`activityDate` varchar(10) NOT NULL,
	`activityCount` int NOT NULL DEFAULT 1,
	`firstActivityAt` timestamp NOT NULL DEFAULT (now()),
	`lastActivityAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `studentEngagementDays_id` PRIMARY KEY(`id`),
	CONSTRAINT `engagement_student_date_unq` UNIQUE(`studentId`,`activityDate`)
);
--> statement-breakpoint
ALTER TABLE `reportExports` MODIFY COLUMN `type` enum('course','user','performance','system','intervention') NOT NULL;--> statement-breakpoint
ALTER TABLE `studentEngagementDays` ADD CONSTRAINT `studentEngagementDays_studentId_users_id_fk` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `engagement_student_date_idx` ON `studentEngagementDays` (`studentId`,`activityDate`);