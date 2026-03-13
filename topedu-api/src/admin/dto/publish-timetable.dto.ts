import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';

export class PublishTimetableRowDto {
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

export class PublishTimetableDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(260)
  weekOffset!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PublishTimetableRowDto)
  rows!: PublishTimetableRowDto[];
}
