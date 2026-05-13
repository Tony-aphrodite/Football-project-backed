import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PagarmeService } from './pagarme.service';
import { DynamoDbModule } from '../dynamodb/dynamodb.module';
import { ShippingModule } from '../shipping/shipping.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports:     [DynamoDbModule, ShippingModule, UsersModule],
  controllers: [PaymentsController],
  providers:   [PaymentsService, PagarmeService],
  exports:     [PaymentsService],
})
export class PaymentsModule {}
