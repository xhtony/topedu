-- Drop old unique key that only supports this/next week
DROP INDEX `uq_course_slots_week_day_time` ON `course_slots`;

-- Add new unique key that supports future week schedules
CREATE UNIQUE INDEX `uq_course_slots_week_day_time`
ON `course_slots`(`week_offset`, `weekday_index`, `start_minute`, `end_minute`);
