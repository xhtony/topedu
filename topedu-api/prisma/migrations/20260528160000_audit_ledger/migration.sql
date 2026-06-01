-- CreateEnum
-- Prisma MySQL: use ALTER TABLE with ENUM columns

ALTER TABLE `attendances`
    ADD COLUMN `record_source` ENUM('STUDENT', 'ADMIN', 'SYSTEM') NOT NULL DEFAULT 'STUDENT',
    ADD COLUMN `created_by_id` VARCHAR(191) NULL,
    ADD COLUMN `billing_selection_reason` ENUM(
        'REQUESTED',
        'ONLY_CNY_WALLET',
        'ONLY_NZD_WALLET',
        'SUFFICIENT_BALANCE_CNY',
        'SUFFICIENT_BALANCE_NZD',
        'MAX_REMAINING_CNY',
        'MAX_REMAINING_NZD',
        'MIN_OVERDRAFT_CNY',
        'MIN_OVERDRAFT_NZD',
        'WALLET_CURRENCY_DEFAULT',
        'FALLBACK_CNY'
    ) NULL;

CREATE INDEX `idx_attendance_created_by_id` ON `attendances`(`created_by_id`);

UPDATE `attendances`
SET `record_source` = 'STUDENT',
    `created_by_id` = `user_id`
WHERE `created_by_id` IS NULL;

ALTER TABLE `recharge_records`
    ADD COLUMN `record_source` ENUM('STUDENT', 'ADMIN', 'SYSTEM') NOT NULL DEFAULT 'ADMIN',
    ADD COLUMN `batch_id` VARCHAR(191) NULL,
    ADD COLUMN `balance_cny_after` DECIMAL(10, 2) NULL,
    ADD COLUMN `balance_nzd_after` DECIMAL(10, 2) NULL;

CREATE INDEX `idx_recharge_records_batch_id` ON `recharge_records`(`batch_id`);

UPDATE `recharge_records`
SET `record_source` = 'ADMIN'
WHERE `record_source` IS NULL;
