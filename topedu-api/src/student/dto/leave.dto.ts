import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LeaveDto {
  @IsString()
  @IsNotEmpty()
  enrollmentId!: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
