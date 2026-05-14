import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchListingsDto {
  @IsString()
  @IsOptional()
  q?: string;

  @IsString()
  @IsOptional()
  filters?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  hitsPerPage?: number;
}
