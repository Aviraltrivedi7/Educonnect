CREATE TABLE `trendExportRetentionRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policyId` int NOT NULL,
	`userId` int NOT NULL,
	`taskUid` varchar(65) NOT NULL,
	`status` varchar(16) NOT NULL,
	`deletedCount` int NOT NULL DEFAULT 0,
	`details` json,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `trendExportRetentionRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `trendExportRetentionRuns` ADD CONSTRAINT `trend_retention_run_policy_fk` FOREIGN KEY (`policyId`) REFERENCES `trendExportRetentionPolicies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trendExportRetentionRuns` ADD CONSTRAINT `trend_retention_run_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `trend_retention_run_user_idx` ON `trendExportRetentionRuns` (`userId`,`startedAt`);--> statement-breakpoint
CREATE INDEX `trend_retention_run_policy_idx` ON `trendExportRetentionRuns` (`policyId`,`startedAt`);
