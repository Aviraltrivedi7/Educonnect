CREATE TABLE `schoolInvites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`schoolId` int NOT NULL,
	`createdBy` int NOT NULL,
	`code` varchar(48) NOT NULL,
	`role` enum('user','teacher','admin') NOT NULL DEFAULT 'user',
	`expiresAt` timestamp NOT NULL,
	`acceptedBy` int,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `schoolInvites_id` PRIMARY KEY(`id`),
	CONSTRAINT `schoolInvites_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `schoolInvites` ADD CONSTRAINT `schoolInvites_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schoolInvites` ADD CONSTRAINT `schoolInvites_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schoolInvites` ADD CONSTRAINT `schoolInvites_acceptedBy_users_id_fk` FOREIGN KEY (`acceptedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `school_invites_school_idx` ON `schoolInvites` (`schoolId`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `school_invites_code_idx` ON `schoolInvites` (`code`);