-- AlterTable
ALTER TABLE `users` ADD COLUMN `prepayment` DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- Backfill: historical prepayment total ≈ current balance + fees already deducted
UPDATE `users` u
SET u.`prepayment` = (
  COALESCE(
    (SELECT SUM(a.`fee_deducted`) FROM `attendances` a WHERE a.`user_id` = u.`id`),
    0
  ) + u.`balance`
);
