import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { DynamoDbModule } from '../dynamodb/dynamodb.module';

@Module({
  imports:     [DynamoDbModule],
  controllers: [CartController],
  providers:   [CartService],
  exports:     [CartService],
})
export class CartModule {}
