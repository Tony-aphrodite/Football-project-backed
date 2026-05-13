import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { AdminGuard } from '../common/guards/admin.guard';
import { DeveloperEarningsService } from './developer-earnings.service';

class RecordWithdrawalDto {
  @IsInt() @Min(1)
  amountCents!: number;

  @IsOptional() @IsString()
  notes?: string;
}

@Controller('developer-earnings')
@UseGuards(AdminGuard)
export class DeveloperEarningsController {
  constructor(private readonly svc: DeveloperEarningsService) {}

  @Get()
  getSummary() {
    return this.svc.getSummary();
  }

  @Post('withdrawal')
  recordWithdrawal(@Body() dto: RecordWithdrawalDto) {
    return this.svc.recordWithdrawal(dto.amountCents, dto.notes);
  }
}
