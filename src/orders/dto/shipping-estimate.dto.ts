import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class ShippingEstimateDto {
  @IsString() @Length(8, 9) fromCep!: string;
  @IsString() @Length(8, 9) toCep!: string;
  @IsOptional() @IsInt() @Min(50) weightGrams?: number;
}
