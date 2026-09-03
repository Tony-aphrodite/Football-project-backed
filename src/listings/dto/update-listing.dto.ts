import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type {
  ListingCondition,
  ListingContinent,
  ListingGarmentType,
  ListingGender,
  ListingKind,
  ListingModel,
  ListingSize,
  ListingSupplier,
} from '../entities/listing.entity';

/** Editable fields of an existing listing. All optional — only sent fields change. */
export class UpdateListingDto {
  @IsOptional()
  @IsEnum(['TIME', 'SELECAO'])
  kind?: ListingKind;

  @IsOptional()
  @IsString()
  @MinLength(2)
  teamName?: string;

  @IsOptional()
  @IsEnum(['AMERICA', 'EUROPA', 'ASIA', 'AFRICA', 'OCEANIA'])
  continent?: ListingContinent;

  @IsOptional()
  @IsString()
  @MinLength(2)
  country?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  season?: string;

  @IsOptional()
  @IsEnum(['ADIDAS', 'NIKE', 'PUMA', 'UMBRO', 'KAPPA', 'LE_COQ_SPORTIF',
           'NEW_BALANCE', 'UNDER_ARMOUR', 'PENALTY', 'TOPPER', 'REUSCH', 'LOTTO', 'OUTRO'])
  supplier?: ListingSupplier;

  @IsOptional()
  @IsEnum(['TITULAR', 'RESERVA', 'TERCEIRA', 'GOLEIRO', 'TREINO', 'COMEMORATIVA'])
  model?: ListingModel;

  @IsOptional()
  @IsEnum(['LOJA', 'JOGO'])
  garmentType?: ListingGarmentType;

  @IsOptional()
  @IsEnum(['PP', 'P', 'M', 'G', 'GG', 'XGG', '2XGG', '3XGG'])
  size?: ListingSize;

  @IsOptional()
  @IsEnum(['COM_ETIQUETA', 'PERFEITA', 'EXCELENTE', 'BOA', 'REGULAR', 'DESGASTADA'])
  condition?: ListingCondition;

  @IsOptional()
  @IsEnum(['MASCULINO', 'FEMININO'])
  gender?: ListingGender;

  @IsOptional()
  @IsInt()
  @Min(100)
  priceCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(50)
  weightGrams?: number;

  @IsOptional()
  @IsString()
  sku?: string;
}
