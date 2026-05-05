import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, UseGuards, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ListingsService } from './listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdatePriceDto } from './dto/update-price.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { R2Service } from '../r2/r2.service';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { ListingPublic } from './entities/listing.entity';

@Controller('listings')
export class ListingsController {
  constructor(
    private readonly listings: ListingsService,
    private readonly r2: R2Service,
  ) {}

  // public — no auth required
  @Get('feed')
  feed(@Query('limit') limit?: string): Promise<ListingPublic[]> {
    return this.listings.feed(limit ? Math.min(Number(limit), 100) : 40);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateListingDto,
  ): Promise<{ listing: ListingPublic; listingsActiveCount: number }> {
    return this.listings.create(user.sub, dto);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: JwtPayload): Promise<ListingPublic[]> {
    return this.listings.listMine(user.sub);
  }

  // Must be BEFORE :id routes to avoid route conflicts
  @Get('seller/:sellerId')
  listBySeller(@Param('sellerId') sellerId: string): Promise<ListingPublic[]> {
    return this.listings.listBySeller(sellerId);
  }

  @Patch(':id/price')
  @UseGuards(JwtAuthGuard)
  updatePrice(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePriceDto,
  ): Promise<ListingPublic> {
    return this.listings.updatePrice(user.sub, id, dto);
  }

  @Patch(':id/remove')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<void> {
    return this.listings.remove(user.sub, id);
  }

  @Patch(':id/mpc')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  setMpc(
    @Param('id') id: string,
    @Body('isMpc') isMpc: boolean,
  ): Promise<ListingPublic> {
    return this.listings.setMpc(id, isMpc ?? true);
  }

  @Post(':id/photos/presign')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async presignPhoto(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('contentType') contentType: string,
  ): Promise<{ uploadUrl: string; key: string }> {
    if (!contentType) throw new BadRequestException('contentType is required');
    const record = await this.listings.getRecord(id);
    if (!record) throw new NotFoundException('Listing not found');
    return this.r2.presignUpload(id, contentType, record.photoKeys.length);
  }

  @Post(':id/photos/confirm')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  confirmPhoto(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('key') key: string,
  ): Promise<ListingPublic> {
    if (!key) throw new BadRequestException('key is required');
    return this.listings.addPhotoKey(user.sub, id, key);
  }

  @Delete(':id/photos')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async deletePhoto(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('key') key: string,
  ): Promise<ListingPublic> {
    if (!key) throw new BadRequestException('key is required');
    await this.r2.deleteObject(key);
    return this.listings.removePhotoKey(user.sub, id, key);
  }
}
