import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Length, Matches, MaxLength, Min } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { UsersService } from './users.service';
import { Throttle } from '@nestjs/throttler';
import { PagarmeService } from '../payments/pagarme.service';
import { R2Service } from '../r2/r2.service';
import { SurveyDto } from './dto/survey.dto';
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
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @IsString() bairro?: string;
}

class SetRecipientDto {
  @IsString() recipientId!: string;
}

class PresignAvatarDto {
  @IsString() @Matches(/^image\/(jpeg|png|webp)$/) contentType!: string;
}

class SetAvatarDto {
  @IsString() @MaxLength(200) avatarKey!: string;
}

class UpdateDadosPessoaisDto {
  @IsString() @Length(2, 120) nomeCompleto!: string;
  // Ignored: sent by app versions before 1.0.18. The e-mail only changes through
  // the verified flow in /auth/email/change.
  @IsOptional() @IsString() @Length(0, 120) email?: string;
}

class UpdateBankDto {
  @IsString() @Length(3, 5)   bankCode!: string;
  @IsString() @Length(1, 10)  bankAgency!: string;
  @IsOptional() @IsString()   bankAgencyDigit?: string;
  @IsString() @Length(1, 15)  bankAccount!: string;
  @IsString() @Length(1, 2)   bankAccountDigit!: string;
}

class ChangeBankDto extends UpdateBankDto {
  @IsOptional() @IsString() @MaxLength(100) password?: string;
  @IsOptional() @IsString() @Matches(/^\d{6}$/) totpCode?: string;
}

class BirthDateDto {
  @IsString() @MaxLength(10) birthDate!: string;
}

class SacarDto {
  @IsInt() @Min(100) amountCents!: number;
}

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly pagarme: PagarmeService,
    private readonly r2: R2Service,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Request() req: { user: JwtPayload }) {
    const u = await this.users.getById(req.user.sub);
    const { toPublic } = await import('./entities/user.entity');
    return toPublic(u);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/survey')
  submitSurvey(@Body() dto: SurveyDto, @Request() req: { user: JwtPayload }) {
    return this.users.submitSurvey(
      req.user.sub,
      dto.profile,
      dto.collectionSize,
      dto.storeSize,
      dto.buyPerMonth,
      dto.sellPerMonth,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/cep')
  updateCep(@Body() dto: UpdateCepDto, @Request() req: { user: JwtPayload }) {
    return this.users.updateSellerCep(req.user.sub, dto.cep, dto.rua, dto.numero, dto.cidade, dto.estado, dto.complemento, dto.bairro);
  }

  /** Step 1 of setting a profile picture: where to PUT the file. */
  @UseGuards(JwtAuthGuard)
  @Post('me/avatar/presign')
  presignAvatar(@Body() dto: PresignAvatarDto, @Request() req: { user: JwtPayload }) {
    return this.r2.presignAvatar(req.user.sub, dto.contentType);
  }

  /** Step 2: the upload finished, so the key becomes the profile picture. */
  @UseGuards(JwtAuthGuard)
  @Patch('me/avatar')
  setAvatar(@Body() dto: SetAvatarDto, @Request() req: { user: JwtPayload }) {
    return this.users.setAvatar(req.user.sub, dto.avatarKey);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/avatar')
  removeAvatar(@Request() req: { user: JwtPayload }) {
    return this.users.setAvatar(req.user.sub, null);
  }

  /** Name, picture and seller rating of another member. */
  @UseGuards(JwtAuthGuard)
  @Get(':userId/public')
  publicProfile(@Param('userId') userId: string) {
    return this.users.publicProfile(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/push-token')
  updatePushToken(@Body() dto: UpdatePushTokenDto, @Request() req: { user: JwtPayload }) {
    return this.users.updatePushToken(req.user.sub, dto.token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/dados-pessoais')
  async updateDadosPessoais(@Body() dto: UpdateDadosPessoaisDto, @Request() req: { user: JwtPayload }) {
    try {
      return await this.users.updateDadosPessoais(req.user.sub, { nomeCompleto: dto.nomeCompleto });
    } catch (e) {
      if ((e as Error).message === 'LOCKED') throw new BadRequestException('Dados pessoais já registrados. Entre em contato via contato@arenadosmantos.app.br');
      throw e;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/birth-date')
  setBirthDate(@Body() dto: BirthDateDto, @Request() req: { user: JwtPayload }) {
    return this.users.setBirthDate(req.user.sub, dto.birthDate);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/financeiro/bank')
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
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/financeiro/bank/change')
  changeBankData(@Body() dto: ChangeBankDto, @Request() req: { user: JwtPayload }) {
    return this.users.changeBankData(req.user.sub, dto, this.pagarme);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/financeiro/balance')
  getBalance(@Request() req: { user: JwtPayload }) {
    return this.users.getFinanceiroBalance(req.user.sub, this.pagarme);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/financeiro/withdrawals')
  getWithdrawals(@Request() req: { user: JwtPayload }) {
    return this.users.getWithdrawalHistory(req.user.sub, this.pagarme);
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
