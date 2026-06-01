import { IsArray, IsString } from 'class-validator';

export class SetUserEnrollmentSlotsDto {
  @IsArray()
  @IsString({ each: true })
  slotIds!: string[];
}
