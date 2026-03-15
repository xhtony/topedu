CREATE TABLE `password_reset_tokens` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `token_hash` VARCHAR(191) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `password_reset_tokens_token_hash_key` ON `password_reset_tokens`(`token_hash`);
CREATE INDEX `idx_password_reset_tokens_user_id` ON `password_reset_tokens`(`user_id`);
CREATE INDEX `idx_password_reset_tokens_expires_at` ON `password_reset_tokens`(`expires_at`);
