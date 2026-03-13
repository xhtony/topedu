-- CreateTable
CREATE TABLE `course_slots` (
    `id` VARCHAR(191) NOT NULL,
    `week_type` ENUM('THIS_WEEK', 'NEXT_WEEK') NOT NULL,
    `weekday` ENUM('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN') NOT NULL,
    `time_slot` ENUM('MORNING', 'AFTERNOON', 'EVENING') NOT NULL,
    `course_name` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_course_slots_week_type`(`week_type`),
    UNIQUE INDEX `uq_course_slots_week_day_time`(`week_type`, `weekday`, `time_slot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_selections` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `course_slot_id` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED') NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_course_selections_user_id`(`user_id`),
    INDEX `idx_course_selections_slot_id`(`course_slot_id`),
    UNIQUE INDEX `uq_course_selections_user_slot`(`user_id`, `course_slot_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `course_selections` ADD CONSTRAINT `course_selections_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_selections` ADD CONSTRAINT `course_selections_course_slot_id_fkey` FOREIGN KEY (`course_slot_id`) REFERENCES `course_slots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
