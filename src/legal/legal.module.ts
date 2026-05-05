import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller';

@Module({ controllers: [LegalController] })
export class LegalModule {}
