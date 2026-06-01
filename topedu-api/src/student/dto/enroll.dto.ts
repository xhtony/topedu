import { IsNotEmpty, IsString } from 'class-validator';

export class EnrollDto {
  @IsString()
  @IsNotEmpty()
  scheduleSlotId!: string;
}
