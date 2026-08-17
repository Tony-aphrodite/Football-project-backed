import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class DisputeOrderDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}
