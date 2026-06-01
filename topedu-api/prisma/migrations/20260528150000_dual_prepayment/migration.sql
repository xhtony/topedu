-- Add dual-currency prepayment and balance columns
ALTER TABLE `users` ADD COLUMN `prepayment_cny` DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE `users` ADD COLUMN `prepayment_nzd` DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE `users` ADD COLUMN `balance_cny` DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE `users` ADD COLUMN `balance_nzd` DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- Migrate existing single-currency data
UPDATE `users` SET `prepayment_cny` = `prepayment`, `balance_cny` = `balance` WHERE `wallet_currency` = 'CNY' OR (`wallet_currency` IS NULL AND `prepayment` > 0);
UPDATE `users` SET `prepayment_nzd` = `prepayment`, `balance_nzd` = `balance` WHERE `wallet_currency` = 'NZD';

ALTER TABLE `users` DROP COLUMN `prepayment`;
ALTER TABLE `users` DROP COLUMN `balance`;
