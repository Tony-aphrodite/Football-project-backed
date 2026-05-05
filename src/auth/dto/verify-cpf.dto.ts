import { IsString, Matches } from 'class-validator';

export class VerifyCpfDto {
  // Accepts the masked or unmasked form; the service strips punctuation before
  // running the mod-11 check.
  @IsString()
  @Matches(/^[\d.\-]{11,14}$/, {
    message: 'cpf must contain 11 digits, optionally formatted as 000.000.000-00',
  })
  cpf!: string;
}
