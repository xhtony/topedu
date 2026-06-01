-- TopEdu production database schema (MySQL 8+)
-- Generated from prisma/schema.prisma — do not edit by hand.
-- Regenerate: npm run prisma:sql-init
--
-- Usage (empty database):
--   mysql -h HOST -u USER -p DATABASE < prisma/sql/init.sql
--
-- Notes:
-- - No foreign keys (relationMode = "prisma" in schema.prisma)
-- - Default admin account is created on first API startup (auth.service.ts)

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'TEACHER', 'STUDENT') NOT NULL DEFAULT 'STUDENT',
    `gender` VARCHAR(191) NULL,
    `wallet_currency` ENUM('CNY', 'NZD') NULL,
    `prepayment_cny` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `prepayment_nzd` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `balance_cny` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `balance_nzd` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `must_change_password` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `user_agent` VARCHAR(191) NULL,
    `ip_address` VARCHAR(191) NULL,

    UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `idx_refresh_tokens_user_id`(`user_id`),
    INDEX `idx_refresh_tokens_expires_at`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_reset_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_reset_tokens_token_hash_key`(`token_hash`),
    INDEX `idx_password_reset_tokens_user_id`(`user_id`),
    INDEX `idx_password_reset_tokens_expires_at`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `courses` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('GROUP', 'PRIVATE') NOT NULL DEFAULT 'GROUP',
    `fee_cny` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `fee_nzd` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `teacher_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_courses_teacher_id`(`teacher_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `timetable_modules` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `start_date` DATETIME(3) NOT NULL,
    `end_date` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_timetable_modules_start_date`(`start_date`),
    INDEX `idx_timetable_modules_end_date`(`end_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schedule_slots` (
    `id` VARCHAR(191) NOT NULL,
    `module_id` VARCHAR(191) NOT NULL,
    `weekday` INTEGER NOT NULL,
    `start_minute` INTEGER NOT NULL,
    `end_minute` INTEGER NOT NULL,
    `course_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_schedule_slots_module_id`(`module_id`),
    INDEX `idx_schedule_slots_course_id`(`course_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `enrollments` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `schedule_slot_id` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'ENDED') NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_enrollments_user_id`(`user_id`),
    INDEX `idx_enrollments_schedule_slot_id`(`schedule_slot_id`),
    UNIQUE INDEX `uq_enrollments_user_slot`(`user_id`, `schedule_slot_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendances` (
    `id` VARCHAR(191) NOT NULL,
    `enrollment_id` VARCHAR(191) NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `schedule_slot_id` VARCHAR(191) NOT NULL,
    `course_name` VARCHAR(191) NULL,
    `date` DATE NOT NULL,
    `currency` ENUM('CNY', 'NZD') NOT NULL DEFAULT 'NZD',
    `fee_deducted` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `balance_cny_after` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `balance_nzd_after` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `record_source` ENUM('STUDENT', 'ADMIN', 'SYSTEM') NOT NULL DEFAULT 'STUDENT',
    `created_by_id` VARCHAR(191) NULL,
    `billing_selection_reason` ENUM('REQUESTED', 'ONLY_CNY_WALLET', 'ONLY_NZD_WALLET', 'SUFFICIENT_BALANCE_CNY', 'SUFFICIENT_BALANCE_NZD', 'MAX_REMAINING_CNY', 'MAX_REMAINING_NZD', 'MIN_OVERDRAFT_CNY', 'MIN_OVERDRAFT_NZD', 'WALLET_CURRENCY_DEFAULT', 'FALLBACK_CNY') NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_attendance_user_id`(`user_id`),
    INDEX `idx_attendance_enrollment_id`(`enrollment_id`),
    INDEX `idx_attendance_schedule_slot_id`(`schedule_slot_id`),
    INDEX `idx_attendance_created_by_id`(`created_by_id`),
    UNIQUE INDEX `uq_attendance_user_slot_date`(`user_id`, `schedule_slot_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_requests` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `enrollment_id` VARCHAR(191) NULL,
    `date` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_leave_user_id`(`user_id`),
    UNIQUE INDEX `uq_leave_enrollment_date`(`enrollment_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recharge_records` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `currency` ENUM('CNY', 'NZD') NOT NULL,
    `prepayment_after` DECIMAL(10, 2) NOT NULL,
    `note` VARCHAR(500) NULL,
    `record_type` ENUM('RECHARGE', 'REVERSAL') NOT NULL DEFAULT 'RECHARGE',
    `record_source` ENUM('STUDENT', 'ADMIN', 'SYSTEM') NOT NULL DEFAULT 'ADMIN',
    `batch_id` VARCHAR(191) NULL,
    `related_batch_id` VARCHAR(191) NULL,
    `balance_cny_after` DECIMAL(10, 2) NULL,
    `balance_nzd_after` DECIMAL(10, 2) NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_recharge_records_user_id`(`user_id`),
    INDEX `idx_recharge_records_created_by_id`(`created_by_id`),
    INDEX `idx_recharge_records_created_at`(`created_at`),
    INDEX `idx_recharge_records_batch_id`(`batch_id`),
    INDEX `idx_recharge_records_related_batch_id`(`related_batch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
