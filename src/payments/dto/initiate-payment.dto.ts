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

  /**
   * Single-use token from POST /tokens?appId=<public key>, made by the app so
   * the card number never reaches this server. Replaces the card fields.
   */
  @IsOptional()
  @IsString()
  @Length(6, 64)
  cardToken?: string;

  /** Last 4 digits, for the order record only (a token hides the number). */
  @IsOptional()
  @IsString()
  @Length(4, 4)
  cardLast4?: string;

  /** Raw card digits only — no spaces or dashes */
  @ValidateIf((o: InitiateCardPaymentDto) => !o.useSavedCard && !o.cardToken)
  @IsString()
  @Length(13, 19)
  cardNumber?: string;

  @ValidateIf((o: InitiateCardPaymentDto) => !o.useSavedCard && !o.cardToken)
  @IsString()
  @MinLength(2)
  cardHolderName?: string;

  @ValidateIf((o: InitiateCardPaymentDto) => !o.useSavedCard && !o.cardToken)
  @IsInt()
  @Min(1)
  @Max(12)
  cardExpMonth?: number;

  @ValidateIf((o: InitiateCardPaymentDto) => !o.useSavedCard && !o.cardToken)
  @IsInt()
  @Min(2024)
  cardExpYear?: number;

  @ValidateIf((o: InitiateCardPaymentDto) => !o.useSavedCard && !o.cardToken)
  @IsString()
  @Length(3, 4)
  cardCvv?: string;
}
