import { CourseType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(CourseType)
  type?: CourseType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  feeCny?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  feeNzd?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  teacherId?: string;
}
