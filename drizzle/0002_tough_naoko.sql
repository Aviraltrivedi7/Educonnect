CREATE TABLE `conversationParticipants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`userId` int NOT NULL,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`lastReadAt` timestamp,
	CONSTRAINT `conversationParticipants_id` PRIMARY KEY(`id`),
	CONSTRAINT `conversation_participant_unq` UNIQUE(`conversationId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `conversationParticipants` ADD CONSTRAINT `conversationParticipants_conversationId_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversationParticipants` ADD CONSTRAINT `conversationParticipants_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `participant_user_idx` ON `conversationParticipants` (`userId`);