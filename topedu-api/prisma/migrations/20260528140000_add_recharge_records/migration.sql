-- CreateTable
CREATE TABLE `recharge_records` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `currency` ENUM('CNY', 'NZD') NOT NULL,
    `prepayment_after` DECIMAL(10, 2) NOT NULL,
    `note` VARCHAR(500) NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_recharge_records_user_id`(`user_id`),
    INDEX `idx_recharge_records_created_by_id`(`created_by_id`),
    INDEX `idx_recharge_records_created_at`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
