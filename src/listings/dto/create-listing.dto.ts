import {
  IsBoolean,
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

export class CreateListingDto {
  @IsEnum(['TIME', 'SELECAO'])
  kind!: ListingKind;

  @IsString()
  @MinLength(2)
  teamName!: string;

  @IsEnum(['AMERICA', 'EUROPA', 'ASIA', 'AFRICA', 'OCEANIA'])
  continent!: ListingContinent;

  @IsString()
  @MinLength(2)
  country!: string;

  @IsString()
  @MinLength(4)
  season!: string;

  @IsEnum(['ADIDAS', 'NIKE', 'PUMA', 'UMBRO', 'KAPPA', 'LE_COQ_SPORTIF',
           'NEW_BALANCE', 'UNDER_ARMOUR', 'PENALTY', 'TOPPER', 'REUSCH', 'LOTTO', 'OUTRO'])
  supplier!: ListingSupplier;

  @IsEnum(['TITULAR', 'RESERVA', 'TERCEIRA', 'GOLEIRO', 'TREINO', 'COMEMORATIVA'])
  model!: ListingModel;

  @IsEnum(['LOJA', 'JOGO'])
  garmentType!: ListingGarmentType;

  @IsEnum(['PP', 'P', 'M', 'G', 'GG', 'XGG', '2XGG', '3XGG'])
  size!: ListingSize;

  @IsEnum(['COM_ETIQUETA', 'PERFEITA', 'EXCELENTE', 'BOA', 'REGULAR', 'DESGASTADA'])
  condition!: ListingCondition;

  @IsEnum(['MASCULINO', 'FEMININO'])
  gender!: ListingGender;

  @IsInt()
  @Min(100)
  priceCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsBoolean()
  nonVerifiedSupplierAck!: boolean;
}
