import {
  Body,
  Controller,
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

import { PaymentsService, type PixPaymentResult, type PaymentStatusResult } from './payments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

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
