ALTER TABLE `activityFilterPresets` ADD `schoolId` int;--> statement-breakpoint
UPDATE `activityFilterPresets` AS presets INNER JOIN `users` AS members ON members.`id` = presets.`userId` SET presets.`schoolId` = members.`schoolId` WHERE presets.`schoolId` IS NULL;--> statement-breakpoint
ALTER TABLE `activityFilterPresets` MODIFY `schoolId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `activityFilterPresets` ADD `isDefault` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `activityFilterPresets` ADD `isShared` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `activityFilterPresets` ADD CONSTRAINT `activityFilterPresets_schoolId_schools_id_fk` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `activity_filter_preset_school_shared_idx` ON `activityFilterPresets` (`schoolId`,`isShared`);
