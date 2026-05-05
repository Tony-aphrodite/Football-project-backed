import { IsString, Length } from 'class-validator';

export class CreateCommentDto {
  @IsString() @Length(1, 500) body!: string;
}
