import { IsIn, IsString } from 'class-validator';

const PROFILE_VALUES    = ['colecionador', 'lojista', 'ambos'] as const;
const SIZE_VALUES       = ['ate_50', '51_100', '101_200', '200_plus'] as const;
const MONTHLY_VALUES    = ['ate_3', '4_10', '11_20', '20_plus'] as const;

export class SurveyDto {
  @IsString() @IsIn(PROFILE_VALUES)
  profile!: string;

  @IsString() @IsIn(SIZE_VALUES)
  collectionSize!: string;

  @IsString() @IsIn(SIZE_VALUES)
  storeSize!: string;

  @IsString() @IsIn(MONTHLY_VALUES)
  buyPerMonth!: string;

  @IsString() @IsIn(MONTHLY_VALUES)
  sellPerMonth!: string;
}
