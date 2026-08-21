CREATE TABLE `activityFilterPresetFavorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`presetId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activityFilterPresetFavorites_id` PRIMARY KEY(`id`),
	CONSTRAINT `activity_filter_favorite_user_preset_unq` UNIQUE(`userId`,`presetId`)
);
--> statement-breakpoint
ALTER TABLE `activityFilterPresetFavorites` ADD CONSTRAINT `activityFilterPresetFavorites_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activityFilterPresetFavorites` ADD CONSTRAINT `activity_filter_fav_preset_fk` FOREIGN KEY (`presetId`) REFERENCES `activityFilterPresets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `activity_filter_favorite_preset_idx` ON `activityFilterPresetFavorites` (`presetId`);
