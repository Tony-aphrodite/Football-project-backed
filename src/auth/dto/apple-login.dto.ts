import { IsOptional, IsString, MinLength } from 'class-validator';

export class AppleLoginDto {
  @IsString()
  @MinLength(10)
  identityToken!: string;

  /**
   * Apple only sends the user's name on the very first authorization.
   * The mobile client must capture it then and forward it here.
   */
  @IsString()
  @IsOptional()
  fullName?: string;
}
