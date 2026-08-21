ALTER TABLE `notificationPreferences` ADD `emailDeliveryEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `notificationPreferences` ADD `pushDeliveryEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `notificationPreferences` ADD `reminderEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `notificationPreferences` ADD `reminderTimeUtc` varchar(5) DEFAULT '09:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `notificationPreferences` ADD `reminderWeekdaysOnly` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `notificationPreferences` ADD `reminderScheduleCronTaskUid` varchar(65);--> statement-breakpoint
ALTER TABLE `notificationPreferences` ADD `reminderNextExecutionAt` timestamp;--> statement-breakpoint
ALTER TABLE `notificationPreferences` ADD `reminderLastSentAt` timestamp;--> statement-breakpoint
CREATE INDEX `notification_preferences_cron_idx` ON `notificationPreferences` (`reminderScheduleCronTaskUid`);