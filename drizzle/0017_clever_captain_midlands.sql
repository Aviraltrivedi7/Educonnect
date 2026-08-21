CREATE TABLE `trendExportRetentionPolicies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`retentionDays` int NOT NULL DEFAULT 30,
	`enabled` boolean NOT NULL DEFAULT false,
	`scheduleCronTaskUid` varchar(65),
	`lastCleanedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trendExportRetentionPolicies_id` PRIMARY KEY(`id`),
	CONSTRAINT `trend_retention_user_unq` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `activityFilterPresetFavoriteFolders` ADD `color` varchar(16) DEFAULT '#52749a' NOT NULL;--> statement-breakpoint
ALTER TABLE `trendExportRetentionPolicies` ADD CONSTRAINT `trendExportRetentionPolicies_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `trend_retention_task_idx` ON `trendExportRetentionPolicies` (`scheduleCronTaskUid`);