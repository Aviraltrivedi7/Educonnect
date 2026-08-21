CREATE TABLE `activityFilterPresetFavoriteFolders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(60) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `activityFilterPresetFavoriteFolders_id` PRIMARY KEY(`id`),
	CONSTRAINT `activity_favorite_folder_user_name_unq` UNIQUE(`userId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `activityFilterPresetFavorites` ADD `folderId` int;--> statement-breakpoint
ALTER TABLE `trendExportDownloads` ADD `archivedAt` timestamp;--> statement-breakpoint
ALTER TABLE `activityFilterPresetFavoriteFolders` ADD CONSTRAINT `activityFilterPresetFavoriteFolders_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `activity_favorite_folder_user_idx` ON `activityFilterPresetFavoriteFolders` (`userId`);--> statement-breakpoint
ALTER TABLE `activityFilterPresetFavorites` ADD CONSTRAINT `activity_fav_folder_fk` FOREIGN KEY (`folderId`) REFERENCES `activityFilterPresetFavoriteFolders`(`id`) ON DELETE no action ON UPDATE no action;
