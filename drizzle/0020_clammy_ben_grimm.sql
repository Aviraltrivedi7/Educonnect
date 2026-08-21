CREATE TABLE `studentAchievementCertificates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`milestoneId` varchar(64) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`issuedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `studentAchievementCertificates_id` PRIMARY KEY(`id`),
	CONSTRAINT `certificate_student_milestone_unq` UNIQUE(`studentId`,`milestoneId`)
);
--> statement-breakpoint
ALTER TABLE `studentAchievementCertificates` ADD CONSTRAINT `studentAchievementCertificates_studentId_users_id_fk` FOREIGN KEY (`studentId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `certificate_student_issued_idx` ON `studentAchievementCertificates` (`studentId`,`issuedAt`);