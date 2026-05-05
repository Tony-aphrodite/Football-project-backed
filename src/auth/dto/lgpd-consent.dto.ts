import { IsBoolean, IsString } from 'class-validator';

export class LgpdConsentDto {
  @IsBoolean()
  accepted!: boolean;

  /** The version string the user accepted (must match the active version). */
  @IsString()
  version!: string;
}
