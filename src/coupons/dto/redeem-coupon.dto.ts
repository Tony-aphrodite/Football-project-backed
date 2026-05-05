import { IsString, MinLength, MaxLength } from 'class-validator';

export class RedeemCouponDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  code!: string;
}
