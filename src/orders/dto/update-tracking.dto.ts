import { IsString, Length, Matches } from 'class-validator';

export class UpdateTrackingDto {
  @IsString()
  @Length(1, 50)
  @Matches(/^[A-Z0-9]+$/i, { message: 'Tracking code must be alphanumeric' })
  correiosTracking!: string;
}
