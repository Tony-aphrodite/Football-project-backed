import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PagarmeService } from '../payments/pagarme.service';
import { R2Module } from '../r2/r2.module';

@Module({
  imports:     [R2Module],
  controllers: [UsersController],
  providers:   [UsersService, PagarmeService],
  exports:     [UsersService],
})
export class UsersModule {}
