import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { PaymentsService, type PixPaymentResult, type PaymentStatusResult, type CardPaymentResult, type PaymentConfig } from './payments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { InitiateCardPaymentDto } from './dto/initiate-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Initiate PIX payment for an existing order. */
  @Post('pix/:orderId')
  @UseGuards(JwtAuthGuard)
  initiatePixPayment(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
  ): Promise<PixPaymentResult> {
    return this.payments.initiatePixPayment(user.sub, orderId);
  }

  /** Initiate credit card payment for an existing order. */
  @Post('card')
  @UseGuards(JwtAuthGuard)
  initiateCardPayment(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InitiateCardPaymentDto,
  ): Promise<CardPaymentResult> {
    return this.payments.initiateCardPayment(user.sub, dto);
  }

  /** Admin: retry the Correios label for a paid order. */
  @Post('admin/retry-label/:orderId')
  @UseGuards(AdminGuard)
  retryLabel(@Param('orderId') orderId: string): Promise<unknown> {
    return this.payments.retryShippingLabel(orderId);
  }

  /** Admin: list Pagar.me recipients (no bank details returned). */
  @Get('admin/recipients')
  @UseGuards(AdminGuard)
  listRecipients(): Promise<unknown> {
    return this.payments.listRecipients();
  }

  /** Admin: ask Pagar.me why an order's card charge failed (no card data returned). */
  @Get('admin/diagnose/:orderId')
  @UseGuards(AdminGuard)
  diagnose(@Param('orderId') orderId: string): Promise<unknown> {
    return this.payments.diagnosePagarmeOrder(orderId);
  }

  /** Public payment settings for the app (the Pagar.me public key is meant to be public). */
  @Get('config')
  getPaymentConfig(): PaymentConfig {
    return this.payments.getPaymentConfig();
  }

  /** Remove the card saved for one-tap purchases. */
  @Delete('card/saved')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async removeSavedCard(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.payments.removeSavedCard(user.sub);
  }

  /** Poll payment status (buyer/seller). Syncs with Pagar.me if PENDING. */
  @Get('status/:orderId')
  @UseGuards(JwtAuthGuard)
  getPaymentStatus(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
  ): Promise<PaymentStatusResult> {
    return this.payments.getPaymentStatus(user.sub, orderId);
  }

  /**
   * Pagar.me webhook receiver.
   * Must be PUBLIC — Pagar.me does not send a JWT.
   * Signature is validated inside the service.
   */
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-pagarme-signature') signature: string,
  ): Promise<{ ok: boolean }> {
    const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body);
    await this.payments.handleWebhook(rawBody, signature ?? '');
    return { ok: true };
  }
}
