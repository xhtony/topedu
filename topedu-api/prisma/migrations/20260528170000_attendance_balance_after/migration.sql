ALTER TABLE `attendances`
    ADD COLUMN `balance_cny_after` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `balance_nzd_after` DECIMAL(10, 2) NOT NULL DEFAULT 0;
