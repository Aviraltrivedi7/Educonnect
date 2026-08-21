CREATE TABLE `comparisonSharingExportRetentionPolicies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`schoolId` int NOT NULL,
	`configuredBy` int NOT NULL,
	`retentionDays` int NOT NULL DEFAULT 90,
	`enabled` boolean NOT NULL DEFAULT false,
	`scheduleCronTaskUid` varchar(65),
	`lastCleanedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comparisonSharingExportRetentionPolicies_id` PRIMARY KEY(`id`),
	CONSTRAINT `comparison_export_retention_school_unq` UNIQUE(`schoolId`)
);
--> statement-breakpoint
CREATE TABLE `comparisonSharingExportRetentionRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policyId` int NOT NULL,
	`schoolId` int NOT NULL,
	`taskUid` varchar(65) NOT NULL,
	`status` varchar(16) NOT NULL,
	`deletedCount` int NOT NULL DEFAULT 0,
	`details` json,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `comparisonSharingExportRetentionRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `comparisonSharingExportRetentionPolicies` ADD CONSTRAINT `comparisonSharingExportRetentionPolicies_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comparisonSharingExportRetentionPolicies` ADD CONSTRAINT `comparison_export_retention_configured_by_fk` FOREIGN KEY (`configuredBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comparisonSharingExportRetentionRuns` ADD CONSTRAINT `comparison_export_retention_run_policy_fk` FOREIGN KEY (`policyId`) REFERENCES `comparisonSharingExportRetentionPolicies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comparisonSharingExportRetentionRuns` ADD CONSTRAINT `comparison_export_retention_run_school_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `comparison_export_retention_task_idx` ON `comparisonSharingExportRetentionPolicies` (`scheduleCronTaskUid`);--> statement-breakpoint
CREATE INDEX `comparison_export_retention_run_school_idx` ON `comparisonSharingExportRetentionRuns` (`schoolId`,`startedAt`);--> statement-breakpoint
CREATE INDEX `comparison_export_retention_run_policy_idx` ON `comparisonSharingExportRetentionRuns` (`policyId`,`startedAt`);
