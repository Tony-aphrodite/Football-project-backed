import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,  // needed for Pagar.me webhook signature validation
  });
  const config = app.get(ConfigService<AppConfig, true>);

  app.use(helmet());

  const corsOrigins = config.get('cors.origins', { infer: true });
  app.enableCors({
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: true,
  });

  // class-validator on every controller input.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const port = config.get('port', { infer: true });
  await app.listen(port, '0.0.0.0');
  Logger.log(`Arena dos Mantos API listening on :${port}`, 'Bootstrap');
}

void bootstrap();
