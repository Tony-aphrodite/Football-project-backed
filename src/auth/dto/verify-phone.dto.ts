import { Matches } from 'class-validator';

export class VerifyPhoneDto {
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneE164!: string;

  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;
}
