ALTER TABLE `recharge_records`
    ADD COLUMN `record_type` ENUM('RECHARGE', 'REVERSAL') NOT NULL DEFAULT 'RECHARGE',
    ADD COLUMN `related_batch_id` VARCHAR(191) NULL;

CREATE INDEX `idx_recharge_records_related_batch_id` ON `recharge_records`(`related_batch_id`);

UPDATE `recharge_records`
SET `record_type` = 'RECHARGE'
WHERE `record_type` IS NULL;
