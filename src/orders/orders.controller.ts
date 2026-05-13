import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { OrdersService } from './orders.service';
import type { ShippingOption } from '../shipping/shipping.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ShippingEstimateDto } from './dto/shipping-estimate.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { OrderPublic } from './entities/order.entity';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // Must be BEFORE /:id routes to avoid route conflicts
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: JwtPayload): Promise<OrderPublic[]> {
    return this.orders.listMine(user.sub);
  }

  // Public — no auth required
  @Post('shipping-estimate')
  @HttpCode(200)
  estimateShipping(@Body() dto: ShippingEstimateDto): Promise<ShippingOption[]> {
    return this.orders.estimateShipping(dto);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderPublic> {
    return this.orders.create(user.sub, dto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<OrderPublic> {
    return this.orders.findOne(user.sub, id);
  }

  @Patch(':id/confirm-receipt')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  confirmReceipt(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<void> {
    return this.orders.confirmReceipt(user.sub, id);
  }
}
