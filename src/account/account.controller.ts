import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { AccountService } from './account.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

class DeleteAccountDto {
  @IsString() @MaxLength(20) confirm!: string;
  @IsOptional() @IsString() @MaxLength(100) password?: string;
  @IsOptional() @IsString() @Matches(/^\d{6}$/) totpCode?: string;
}

@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  /** The user deletes their own account. */
  @Post('delete')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  async delete(@CurrentUser() user: JwtPayload, @Body() dto: DeleteAccountDto): Promise<void> {
    await this.account.deleteAccount(user.sub, dto);
  }
}
