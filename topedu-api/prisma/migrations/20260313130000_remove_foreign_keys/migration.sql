ALTER TABLE `email_verification_tokens` DROP FOREIGN KEY `email_verification_tokens_user_id_fkey`;
ALTER TABLE `refresh_tokens` DROP FOREIGN KEY `refresh_tokens_user_id_fkey`;
ALTER TABLE `course_selections` DROP FOREIGN KEY `course_selections_user_id_fkey`;
ALTER TABLE `course_selections` DROP FOREIGN KEY `course_selections_course_slot_id_fkey`;
