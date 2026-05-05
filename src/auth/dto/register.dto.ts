import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(60)
  displayName!: string;

  @IsEmail()
  email!: string;

  @IsString() @MinLength(8) @MaxLength(100)
  password!: string;
}
