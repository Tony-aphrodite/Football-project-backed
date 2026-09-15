import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class StartEmailChangeDto {
  @IsEmail() @MaxLength(120) newEmail!: string;
  // Required when the account has a password.
  @IsOptional() @IsString() @MaxLength(100) password?: string;
  // Required when the account has 2FA enabled.
  @IsOptional() @IsString() @Matches(/^\d{6}$/) totpCode?: string;
}

export class ConfirmEmailChangeDto {
  @IsString() @Matches(/^\d{6}$/) code!: string;
}
