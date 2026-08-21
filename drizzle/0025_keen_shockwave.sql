CREATE TABLE `monthlyCertificateAuditReportSchedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`schoolId` int NOT NULL,
	`configuredBy` int NOT NULL,
	`recipientIds` json NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`scheduleCronTaskUid` varchar(65),
	`lastRunAt` timestamp,
	`lastReportExportId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthlyCertificateAuditReportSchedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `monthly_certificate_audit_school_unq` UNIQUE(`schoolId`)
);
--> statement-breakpoint
ALTER TABLE `adminInterventionComparisonViews` ADD `shareExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `adminInterventionComparisonViews` ADD `sharePasswordHash` varchar(128);--> statement-breakpoint
ALTER TABLE `adminInterventionComparisonViews` ADD `sharePasswordSalt` varchar(64);--> statement-breakpoint
ALTER TABLE `monthlyCertificateAuditReportSchedules` ADD CONSTRAINT `mcar_school_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `monthlyCertificateAuditReportSchedules` ADD CONSTRAINT `mcar_configured_by_fk` FOREIGN KEY (`configuredBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `monthlyCertificateAuditReportSchedules` ADD CONSTRAINT `mcar_last_export_fk` FOREIGN KEY (`lastReportExportId`) REFERENCES `reportExports`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `monthly_certificate_audit_task_idx` ON `monthlyCertificateAuditReportSchedules` (`scheduleCronTaskUid`);
