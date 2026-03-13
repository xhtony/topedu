import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsString, Matches, ValidateNested } from 'class-validator';

export class TimetableModuleRowDto {
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsArray()
  @ArrayMinSize(7)
  @IsString({ each: true })
  courses!: string[];
}

export class UpsertTimetableModuleDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TimetableModuleRowDto)
  rows!: TimetableModuleRowDto[];
}
