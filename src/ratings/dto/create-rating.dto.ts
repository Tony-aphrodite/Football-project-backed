import {
  IsArray,
  IsEnum,
  IsString,
  ArrayMinSize,
  ArrayMaxSize,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import type { RaterRole } from '../entities/rating.entity';

export class CreateRatingDto {
  @IsString() orderId!: string;
  @IsString() rateeId!: string;
  @IsEnum(['BUYER', 'SELLER']) raterRole!: RaterRole;
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(4)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(5, { each: true })
  scores!: number[];
}
