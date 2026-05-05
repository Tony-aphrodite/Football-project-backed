import { Matches } from 'class-validator';

export class StartPhoneVerificationDto {
  // E.164 — leading +, country code, up to 15 digits.
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phoneE164 must be a valid E.164 phone number',
  })
  phoneE164!: string;
}
