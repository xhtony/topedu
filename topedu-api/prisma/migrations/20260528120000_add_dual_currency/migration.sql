-- Add Currency enum and dual-currency fields

ALTER TABLE `courses`
    ADD COLUMN `fee_cny` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `fee_nzd` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `currency` ENUM('CNY', 'NZD') NOT NULL DEFAULT 'NZD';

UPDATE `courses` SET `fee_cny` = `fee`, `fee_nzd` = `fee` WHERE `fee` IS NOT NULL;

ALTER TABLE `courses` DROP COLUMN `fee`;

ALTER TABLE `users`
    ADD COLUMN `wallet_currency` ENUM('CNY', 'NZD') NULL;

UPDATE `users`
SET `wallet_currency` = 'NZD'
WHERE `role` = 'STUDENT' AND (`prepayment` > 0 OR `balance` > 0);

ALTER TABLE `attendances`
    ADD COLUMN `currency` ENUM('CNY', 'NZD') NOT NULL DEFAULT 'NZD';
