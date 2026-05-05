import { IsString, Length } from 'class-validator';

export class ReportCommentDto {
  @IsString() @Length(1, 300) reason!: string;
}
