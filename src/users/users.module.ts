import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PagarmeService } from '../payments/pagarme.service';

@Module({
  controllers: [UsersController],
  providers:   [UsersService, PagarmeService],
  exports:     [UsersService],
})
export class UsersModule {}
