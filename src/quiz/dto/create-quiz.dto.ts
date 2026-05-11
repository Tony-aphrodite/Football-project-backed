import { IsArray, IsInt, IsOptional, IsString, Max, Min, MinLength, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class CreateQuizDto {
  @IsString()
  @MinLength(5)
  question!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  options!: string[];

  @IsInt()
  @Min(0)
  @Max(5)
  correctIndex!: number;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}
