CREATE TABLE `notificationPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`staffUpdatesEnabled` boolean NOT NULL DEFAULT true,
	`gradeUpdatesEnabled` boolean NOT NULL DEFAULT true,
	`assessmentUpdatesEnabled` boolean NOT NULL DEFAULT true,
	`learningRemindersEnabled` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_preferences_user_unq` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `notificationPreferences` ADD CONSTRAINT `notificationPreferences_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;