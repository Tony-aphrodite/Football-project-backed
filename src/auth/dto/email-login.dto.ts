import { IsEmail, IsString, MinLength } from 'class-validator';

export class EmailLoginDto {
  @IsEmail()
  email!: string;

  @IsString() @MinLength(1)
  password!: string;
}
