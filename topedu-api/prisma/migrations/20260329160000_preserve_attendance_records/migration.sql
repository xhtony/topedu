-- Attendance: keep rows when enrollment/slots change; match by user + slot + date
ALTER TABLE `attendances`
    ADD COLUMN `schedule_slot_id` VARCHAR(191) NULL,
    ADD COLUMN `course_name` VARCHAR(191) NULL;

UPDATE `attendances` `a`
INNER JOIN `enrollments` `e` ON `a`.`enrollment_id` = `e`.`id`
SET `a`.`schedule_slot_id` = `e`.`schedule_slot_id`;

UPDATE `attendances` `a`
INNER JOIN `enrollments` `e` ON `a`.`enrollment_id` = `e`.`id`
INNER JOIN `schedule_slots` `s` ON `e`.`schedule_slot_id` = `s`.`id`
INNER JOIN `courses` `c` ON `s`.`course_id` = `c`.`id`
SET `a`.`course_name` = `c`.`name`
WHERE `a`.`course_name` IS NULL;

ALTER TABLE `attendances` MODIFY `schedule_slot_id` VARCHAR(191) NOT NULL;

DROP INDEX `uq_attendance_enrollment_date` ON `attendances`;

CREATE UNIQUE INDEX `uq_attendance_user_slot_date` ON `attendances`(`user_id`, `schedule_slot_id`, `date`);

CREATE INDEX `idx_attendance_schedule_slot_id` ON `attendances`(`schedule_slot_id`);

ALTER TABLE `attendances` MODIFY `enrollment_id` VARCHAR(191) NULL;

-- Leave requests: optional enrollment when enrollment row is removed
ALTER TABLE `leave_requests` MODIFY `enrollment_id` VARCHAR(191) NULL;

-- Admin can mark removed enrollments without deleting attendance history
ALTER TABLE `enrollments` MODIFY `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'ENDED') NOT NULL DEFAULT 'PENDING';
