import { IsNotEmpty, IsString } from 'class-validator';

export class SelectCourseDto {
  @IsString()
  @IsNotEmpty()
  slotId!: string;
}
