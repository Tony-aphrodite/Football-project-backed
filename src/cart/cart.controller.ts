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
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CartService } from './cart.service';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { CartItemEntry } from './cart.entity';

class CartItemDto implements CartItemEntry {
  @IsString() listingId!:  string;
  @IsString() sellerId!:   string;
  @IsString() sellerName!: string;
  @IsString() teamName!:   string;
  @IsString() supplier!:   string;
  @IsString() season!:     string;
  @IsString() size!:       string;
  @IsNumber() priceCents!: number;
  @IsArray() @IsString({ each: true }) photoKeys!: string[];
  @IsString() addedAt!:    string;
}

class AddItemDto {
  @ValidateNested()
  @Type(() => CartItemDto)
  item!: CartItemDto;
}

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
    @Body() dto: AddItemDto,
    @Request() req: { user: JwtPayload },
  ): Promise<{ items: CartItemEntry[] }> {
    const items = await this.cart.addItem(req.user.sub, dto.item);
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
