import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Global so any module can notify by email without wiring an import —
 * mirrors how notifications are already used across orders and payments.
 */
@Global()
@Module({
  providers: [EmailService],
  exports:   [EmailService],
})
export class EmailModule {}
