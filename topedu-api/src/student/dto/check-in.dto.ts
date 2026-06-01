import { Currency } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CheckInDto {
  @IsString()
  @IsNotEmpty()
  enrollmentId!: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;
}
