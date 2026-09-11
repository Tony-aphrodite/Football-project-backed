import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { NotificationsModule } from '../notifications/notifications.module';

// EmailModule is @Global; NotificationsModule is not, so import it here.
@Module({
  imports: [NotificationsModule],
  controllers: [HealthController],
})
export class HealthModule {}
