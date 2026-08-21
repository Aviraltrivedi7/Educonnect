ALTER TABLE `reportExports` ADD `archivedAt` timestamp;--> statement-breakpoint
CREATE INDEX `exports_archived_idx` ON `reportExports` (`archivedAt`,`createdAt`);