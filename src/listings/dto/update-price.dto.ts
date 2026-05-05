import { IsInt, Min } from 'class-validator';

export class UpdatePriceDto {
  @IsInt()
  @Min(100)
  priceCents!: number;
}
