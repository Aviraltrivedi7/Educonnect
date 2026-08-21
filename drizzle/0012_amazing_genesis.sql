CREATE TABLE `trendExportDownloads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`weekCount` int NOT NULL,
	`rowCount` int NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trendExportDownloads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `activityFilterPresets` ADD `tags` json;--> statement-breakpoint
UPDATE `activityFilterPresets` SET `tags` = JSON_ARRAY() WHERE `tags` IS NULL;--> statement-breakpoint
ALTER TABLE `activityFilterPresets` MODIFY `tags` json NOT NULL;--> statement-breakpoint
ALTER TABLE `trendExportDownloads` ADD CONSTRAINT `trendExportDownloads_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `trend_export_user_time_idx` ON `trendExportDownloads` (`userId`,`createdAt`);
