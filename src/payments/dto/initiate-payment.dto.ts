import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Max, Min, MinLength, ValidateIf } from 'class-validator';

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

  /** Pay with the card saved on the account; the card fields are then not needed. */
  @IsOptional()
  @IsBoolean()
  useSavedCard?: boolean;

  /** Keep the typed card in Pagar.me's vault for the next purchases. */
  @IsOptional()
  @IsBoolean()
  saveCard?: boolean;

  /** Raw card digits only — no spaces or dashes */
  @ValidateIf((o: InitiateCardPaymentDto) => !o.useSavedCard)
  @IsString()
  @Length(13, 19)
  cardNumber?: string;

  @ValidateIf((o: InitiateCardPaymentDto) => !o.useSavedCard)
  @IsString()
  @MinLength(2)
  cardHolderName?: string;

  @ValidateIf((o: InitiateCardPaymentDto) => !o.useSavedCard)
  @IsInt()
  @Min(1)
  @Max(12)
  cardExpMonth?: number;

  @ValidateIf((o: InitiateCardPaymentDto) => !o.useSavedCard)
  @IsInt()
  @Min(2024)
  cardExpYear?: number;

  @ValidateIf((o: InitiateCardPaymentDto) => !o.useSavedCard)
  @IsString()
  @Length(3, 4)
  cardCvv?: string;
}
