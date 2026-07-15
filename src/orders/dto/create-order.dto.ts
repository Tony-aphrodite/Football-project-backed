import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { DeliveryMethod } from '../entities/order.entity';

export class CreateOrderDto {
  @IsString() @IsNotEmpty() listingId!: string;
  @IsEnum(['CORREIOS', 'ENTREGA_EM_MAOS']) deliveryMethod!: DeliveryMethod;
  @IsString() @IsOptional() buyerCep?: string;
  @IsInt() @IsOptional() shippingServiceId?: number;
  @IsString() @IsOptional() couponCode?: string;
}
