import { IsNumber, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';

export class RechargeDto {
  @ValidateIf((o) => o.amountCny != null)
  @IsNumber()
  @Min(0.01)
  amountCny?: number;

  @ValidateIf((o) => o.amountNzd != null)
  @IsNumber()
  @Min(0.01)
  amountNzd?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
