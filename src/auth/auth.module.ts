import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleOAuthService } from './services/google-oauth.service';
import { AppleOAuthService } from './services/apple-oauth.service';
import { TwilioVerifyService } from './services/twilio-verify.service';
import { CpfValidatorService } from './services/cpf-validator.service';
import { TotpService } from './services/totp.service';
import { UsersModule } from '../users/users.module';
import { DynamoDbModule } from '../dynamodb/dynamodb.module';

@Module({
  imports: [
    UsersModule,
    DynamoDbModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Module is registered without secrets here; we sign and verify via
    // explicit options inside AuthService so access and refresh tokens use
    // different secrets cleanly.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleOAuthService,
    AppleOAuthService,
    TwilioVerifyService,
    CpfValidatorService,
    TotpService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
