ALTER TABLE `course_slots` ADD COLUMN `module_id` VARCHAR(191) NULL;
CREATE INDEX `idx_course_slots_module_id` ON `course_slots`(`module_id`);

CREATE TABLE `timetable_modules` (
  `id` VARCHAR(191) NOT NULL,
  `start_date` DATETIME(3) NOT NULL,
  `end_date` DATETIME(3) NOT NULL,
  `rows` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `idx_timetable_modules_start_date` ON `timetable_modules`(`start_date`);
CREATE INDEX `idx_timetable_modules_end_date` ON `timetable_modules`(`end_date`);
