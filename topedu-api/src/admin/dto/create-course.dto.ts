import { CourseType } from '@prisma/client';
import { IsEnum, IsNumber, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEnum(CourseType)
  type!: CourseType;

  @IsNumber()
  @Min(0)
  feeCny!: number;

  @IsNumber()
  @Min(0)
  feeNzd!: number;

  @IsString()
  @MinLength(1)
  teacherId!: string;
}
