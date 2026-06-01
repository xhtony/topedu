import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsNotEmpty, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';

export class ScheduleSlotItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsString()
  @IsNotEmpty()
  courseId!: string;
}

export class SaveTimetableModuleDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotItemDto)
  slots!: ScheduleSlotItemDto[];
}
