import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf } from 'class-validator';

export class RechargeReversalDto {
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

  @IsOptional()
  @IsUUID()
  relatedBatchId?: string;
}
