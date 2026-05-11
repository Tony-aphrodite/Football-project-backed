import { IsInt, Min, Max } from 'class-validator';

export class AnswerQuizDto {
  @IsInt()
  @Min(0)
  @Max(5)
  chosenIndex!: number;
}
