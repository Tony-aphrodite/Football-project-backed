import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';
import type { DeliveryMethod } from '../entities/order.entity';

export class CreateOrderDto {
  @IsString() @IsNotEmpty() listingId!: string;
  @IsEnum(['CORREIOS', 'ENTREGA_EM_MAOS']) deliveryMethod!: DeliveryMethod;
  @IsString() @IsOptional() buyerCep?: string;
  // Full delivery address. Required by the service when deliveryMethod is
  // CORREIOS, since the shipping label is bought against it. Declared here
  // because the global ValidationPipe rejects undeclared fields.
  @IsString() @IsOptional() @MaxLength(120) buyerRua?: string;
  @IsString() @IsOptional() @MaxLength(20)  buyerNumero?: string;
  @IsString() @IsOptional() @MaxLength(80)  buyerComplemento?: string;
  @IsString() @IsOptional() @MaxLength(80)  buyerBairro?: string;
  @IsString() @IsOptional() @MaxLength(80)  buyerCidade?: string;
  @IsString() @IsOptional() @Length(2, 2)   buyerEstado?: string;
  @IsInt() @IsOptional() shippingServiceId?: number;
  @IsInt() @Min(0) @IsOptional() shippingCents?: number;
  @IsString() @IsOptional() couponCode?: string;
}
