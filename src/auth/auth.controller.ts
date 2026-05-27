import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AuthService, type AuthSession, type TotpChallenge } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { EmailLoginDto } from './dto/email-login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { AppleLoginDto } from './dto/apple-login.dto';
import { StartPhoneVerificationDto } from './dto/start-phone-verification.dto';
import { VerifyPhoneDto } from './dto/verify-phone.dto';
import { VerifyCpfDto } from './dto/verify-cpf.dto';
import { LgpdConsentDto } from './dto/lgpd-consent.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { TotpActivateDto } from './dto/totp-activate.dto';
import { TotpAuthenticateDto } from './dto/totp-authenticate.dto';
import { TotpService } from './services/totp.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from './types/jwt-payload.type';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly totp: TotpService,
  ) {}

  @Get('lgpd/current')
  getLgpdPrompt() {
    return this.auth.getLgpdPrompt();
  }

  @Post('register')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto): Promise<AuthSession> {
    return this.auth.registerWithEmail(dto.displayName, dto.email, dto.password, dto.contactPhone, dto.marketingConsent);
  }

  @Post('forgot-password')
  @HttpCode(204)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<AuthSession> {
    return this.auth.resetPassword(dto.email, dto.code, dto.newPassword);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  emailLogin(@Body() dto: EmailLoginDto): Promise<AuthSession | TotpChallenge> {
    return this.auth.signInWithEmail(dto.email, dto.password);
  }

  @Post('google')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  google(@Body() dto: GoogleLoginDto): Promise<AuthSession | TotpChallenge> {
    return this.auth.signInWithGoogle(dto.idToken, dto.platform);
  }

  @Post('apple')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  apple(@Body() dto: AppleLoginDto): Promise<AuthSession | TotpChallenge> {
    return this.auth.signInWithApple(dto.identityToken, dto.fullName);
  }

  // ── TOTP ──────────────────────────────────────────────────────────────────

  @Post('totp/authenticate')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  totpAuthenticate(@Body() dto: TotpAuthenticateDto): Promise<AuthSession> {
    return this.auth.totpAuthenticate(dto.tempToken, dto.code);
  }

  @Post('totp/setup')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  totpSetup(@CurrentUser() user: JwtPayload): Promise<{ qrCodeDataUrl: string }> {
    return this.totp.setup(user.sub);
  }

  @Post('totp/activate')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async totpActivate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TotpActivateDto,
  ): Promise<void> {
    await this.totp.activate(user.sub, dto.code);
  }

  @Post('totp/disable')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async totpDisable(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TotpActivateDto,
  ): Promise<void> {
    await this.totp.disable(user.sub, dto.code);
  }

  @Post('phone/start')
  @HttpCode(204)
  // SMS costs money; keep the limit tight.
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  async startPhone(
    @CurrentUser() user: JwtPayload,
    @Body() dto: StartPhoneVerificationDto,
  ): Promise<void> {
    await this.auth.startPhoneVerification(user.sub, dto.phoneE164);
  }

  @Post('phone/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  verifyPhone(
    @CurrentUser() user: JwtPayload,
    @Body() dto: VerifyPhoneDto,
  ): Promise<AuthSession> {
    return this.auth.verifyPhone(user.sub, dto.phoneE164, dto.code);
  }

  @Post('cpf/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  verifyCpf(
    @CurrentUser() user: JwtPayload,
    @Body() dto: VerifyCpfDto,
  ): Promise<AuthSession> {
    return this.auth.verifyCpf(user.sub, dto.cpf);
  }

  @Post('lgpd/consent')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  recordLgpd(
    @CurrentUser() user: JwtPayload,
    @Body() dto: LgpdConsentDto,
  ): Promise<AuthSession> {
    return this.auth.recordLgpdConsent(user.sub, dto.accepted, dto.version);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthSession> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }
}
