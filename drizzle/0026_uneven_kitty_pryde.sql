CREATE TABLE `monthlyComparisonReviewSchedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`schoolId` int NOT NULL,
	`configuredBy` int NOT NULL,
	`recipientIds` json NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`expiryWarningDays` int NOT NULL DEFAULT 14,
	`scheduleCronTaskUid` varchar(65),
	`lastRunAt` timestamp,
	`lastReviewedCount` int NOT NULL DEFAULT 0,
	`lastRevokedCount` int NOT NULL DEFAULT 0,
	`lastSummary` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthlyComparisonReviewSchedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `monthly_comparison_review_school_unq` UNIQUE(`schoolId`)
);
--> statement-breakpoint
ALTER TABLE `monthlyComparisonReviewSchedules` ADD CONSTRAINT `monthlyComparisonReviewSchedules_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `monthlyComparisonReviewSchedules` ADD CONSTRAINT `monthlyComparisonReviewSchedules_configuredBy_users_id_fk` FOREIGN KEY (`configuredBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `monthly_comparison_review_task_idx` ON `monthlyComparisonReviewSchedules` (`scheduleCronTaskUid`);