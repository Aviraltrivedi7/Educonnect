ALTER TABLE `quizAttempts` ADD `feedback` text;--> statement-breakpoint
ALTER TABLE `quizAttempts` ADD `reviewedBy` int;--> statement-breakpoint
ALTER TABLE `quizAttempts` ADD `reviewedAt` timestamp;--> statement-breakpoint
ALTER TABLE `quizAttempts` ADD CONSTRAINT `quizAttempts_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;