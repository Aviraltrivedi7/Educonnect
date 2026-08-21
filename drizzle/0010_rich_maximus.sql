CREATE TABLE `activityFilterPresets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`courseId` int,
	`subject` varchar(120),
	`classSection` varchar(120),
	`startDate` varchar(10),
	`endDate` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `activityFilterPresets_id` PRIMARY KEY(`id`),
	CONSTRAINT `activity_filter_preset_user_name_unq` UNIQUE(`userId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `activityFilterPresets` ADD CONSTRAINT `activityFilterPresets_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `activity_filter_preset_user_idx` ON `activityFilterPresets` (`userId`);