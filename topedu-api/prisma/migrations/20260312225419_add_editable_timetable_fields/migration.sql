-- DropIndex
DROP INDEX `idx_course_slots_week_type` ON `course_slots`;

-- AlterTable
ALTER TABLE `course_slots` ADD COLUMN `end_minute` INTEGER NULL,
    ADD COLUMN `start_minute` INTEGER NULL,
    ADD COLUMN `week_offset` INTEGER NULL,
    ADD COLUMN `weekday_index` INTEGER NULL;

-- CreateIndex
CREATE INDEX `idx_course_slots_week_offset` ON `course_slots`(`week_offset`);
