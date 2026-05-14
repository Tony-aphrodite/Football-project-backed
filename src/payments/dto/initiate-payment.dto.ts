import { IsEnum, IsString } from 'class-validator';

export enum PaymentMethod {
  PIX = 'PIX',
}

export class InitiatePaymentDto {
  @IsString()
  orderId!: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;
}
