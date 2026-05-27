import { IsEmail, IsString, Matches, MinLength, MaxLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(6) @MaxLength(6) @Matches(/^\d{6}$/) code!: string;
  @IsString() @MinLength(8) @MaxLength(100) newPassword!: string;
}
