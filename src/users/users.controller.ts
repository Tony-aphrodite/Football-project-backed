import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { UsersService } from './users.service';
import { PagarmeService } from '../payments/pagarme.service';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

class UpdatePushTokenDto {
  @IsString() token!: string;
}

class UpdateCepDto {
  @IsString() @Length(8, 9) cep!: string;
  @IsOptional() @IsString() rua?:    string;
  @IsOptional() @IsString() numero?: string;
  @IsOptional() @IsString() cidade?: string;
  @IsOptional() @IsString() estado?: string;
}

class SetRecipientDto {
  @IsString() recipientId!: string;
}

class UpdateDadosPessoaisDto {
  @IsString() @Length(2, 120) nomeCompleto!: string;
  @IsString() @Length(5, 120) email!: string;
}

class UpdateBankDto {
  @IsString() @Length(3, 5)   bankCode!: string;
  @IsString() @Length(1, 10)  bankAgency!: string;
  @IsOptional() @IsString()   bankAgencyDigit?: string;
  @IsString() @Length(1, 15)  bankAccount!: string;
  @IsString() @Length(1, 2)   bankAccountDigit!: string;
}

class SacarDto {
  @IsInt() @Min(100) amountCents!: number;
}

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly pagarme: PagarmeService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Patch('me/cep')
  updateCep(@Body() dto: UpdateCepDto, @Request() req: { user: JwtPayload }) {
    return this.users.updateSellerCep(req.user.sub, dto.cep, dto.rua, dto.numero, dto.cidade, dto.estado);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/push-token')
  updatePushToken(@Body() dto: UpdatePushTokenDto, @Request() req: { user: JwtPayload }) {
    return this.users.updatePushToken(req.user.sub, dto.token);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/dados-pessoais')
  async updateDadosPessoais(@Body() dto: UpdateDadosPessoaisDto, @Request() req: { user: JwtPayload }) {
    try {
      return await this.users.updateDadosPessoais(req.user.sub, { nomeCompleto: dto.nomeCompleto, email: dto.email });
    } catch (e) {
      if ((e as Error).message === 'LOCKED') throw new BadRequestException('Dados pessoais já registrados. Entre em contato via contato@arenadosmantos.app.br');
      throw e;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/financeiro/bank')
  async updateBankData(@Body() dto: UpdateBankDto, @Request() req: { user: JwtPayload }) {
    try {
      return await this.users.updateBankData(req.user.sub, dto, this.pagarme);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'LOCKED') throw new BadRequestException('Dados bancários já registrados. Entre em contato via contato@arenadosmantos.app.br');
      if (msg === 'Complete Dados Pessoais first') throw new BadRequestException('Preencha os Dados Pessoais primeiro');
      throw e;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/financeiro/balance')
  getBalance(@Request() req: { user: JwtPayload }) {
    return this.users.getFinanceiroBalance(req.user.sub, this.pagarme);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/financeiro/sacar')
  async sacar(@Body() dto: SacarDto, @Request() req: { user: JwtPayload }) {
    return this.users.requestWithdrawal(req.user.sub, dto.amountCents, this.pagarme);
  }

  // ── Admin: manage Pagar.me recipient IDs ─────────────────────────────────

  @UseGuards(AdminGuard)
  @Get(':userId/recipient')
  getRecipient(@Param('userId') userId: string) {
    return this.users.getRecipientId(userId);
  }

  @UseGuards(AdminGuard)
  @Patch(':userId/recipient')
  setRecipient(@Param('userId') userId: string, @Body() dto: SetRecipientDto) {
    return this.users.setRecipientId(userId, dto.recipientId);
  }
}
