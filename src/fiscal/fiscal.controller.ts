import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { FiscalService } from './fiscal.service';
import type { InvoiceType } from './fiscal.entity';

@Controller('fiscal')
@UseGuards(AdminGuard)
export class FiscalController {
  constructor(private readonly svc: FiscalService) {}

  @Get('invoices')
  listInvoices() {
    return this.svc.listInvoices();
  }

  @Get('invoices/:orderId/:type')
  getInvoice(@Param('orderId') orderId: string, @Param('type') type: string) {
    return this.svc.getInvoice(orderId, type.toUpperCase() as InvoiceType);
  }

  @Post('invoices/:orderId/:type/retry')
  retryInvoice(@Param('orderId') orderId: string, @Param('type') type: string) {
    return this.svc.retryInvoice(orderId, type.toUpperCase() as InvoiceType);
  }
}
