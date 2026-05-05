import { IsString, Length } from 'class-validator';

export class ShippingEstimateDto {
  @IsString() @Length(8, 9) fromCep!: string;
  @IsString() @Length(8, 9) toCep!: string;
}
