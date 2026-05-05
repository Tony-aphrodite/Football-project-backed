import { Module } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CouponsController } from './coupons.controller';
import { DynamoDbModule } from '../dynamodb/dynamodb.module';

@Module({
  imports: [DynamoDbModule],
  controllers: [CouponsController],
  providers: [CouponsService],
})
export class CouponsModule {}
