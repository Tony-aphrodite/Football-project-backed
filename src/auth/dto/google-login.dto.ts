import { IsEnum, IsString, MinLength } from 'class-validator';
import type { GooglePlatform } from '../services/google-oauth.service';

export class GoogleLoginDto {
  @IsString()
  @MinLength(10)
  idToken!: string;

  @IsEnum(['android', 'ios', 'web'] as const)
  platform!: GooglePlatform;
}
