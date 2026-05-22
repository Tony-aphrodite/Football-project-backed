import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CartService } from './cart.service';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { CartItemEntry } from './cart.entity';

@UseGuards(JwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  async getCart(
    @Request() req: { user: JwtPayload },
  ): Promise<{ items: CartItemEntry[] }> {
    const items = await this.cart.getCart(req.user.sub);
    return { items };
  }

  @Post('items')
  async addItem(
    @Body() body: { item: CartItemEntry },
    @Request() req: { user: JwtPayload },
  ): Promise<{ items: CartItemEntry[] }> {
    const items = await this.cart.addItem(req.user.sub, body.item);
    return { items };
  }

  @Delete('items/:listingId')
  async removeItem(
    @Param('listingId') listingId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<{ items: CartItemEntry[] }> {
    const items = await this.cart.removeItem(req.user.sub, listingId);
    return { items };
  }

  @Delete()
  async clearCart(
    @Request() req: { user: JwtPayload },
  ): Promise<{ items: [] }> {
    await this.cart.clearCart(req.user.sub);
    return { items: [] };
  }
}
