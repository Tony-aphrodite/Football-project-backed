import { IsEnum, IsInt, IsString, Length, Max, Min, MinLength } from 'class-validator';

export enum PaymentMethod {
  PIX = 'PIX',
}

export class InitiatePaymentDto {
  @IsString()
  orderId!: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;
}

export class InitiateCardPaymentDto {
  @IsString()
  orderId!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  installments!: number;

  /** Raw card digits only — no spaces or dashes */
  @IsString()
  @Length(13, 19)
  cardNumber!: string;

  @IsString()
  @MinLength(2)
  cardHolderName!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  cardExpMonth!: number;

  @IsInt()
  @Min(2024)
  cardExpYear!: number;

  @IsString()
  @Length(3, 4)
  cardCvv!: string;
}
