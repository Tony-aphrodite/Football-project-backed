import { IsString, Length } from 'class-validator';

export class TotpActivateDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}
