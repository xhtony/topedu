/*
  Warnings:

  - You are about to drop the `daily_checkins` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_courses` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `daily_checkins` DROP FOREIGN KEY `daily_checkins_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `user_courses` DROP FOREIGN KEY `user_courses_user_id_fkey`;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `must_change_password` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER';

-- DropTable
DROP TABLE `daily_checkins`;

-- DropTable
DROP TABLE `user_courses`;
