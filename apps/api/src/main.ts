import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cors from 'cors';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.use(
    cors({
      origin: (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000').split(','),
      credentials: true,
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('PriceGuard AI Core Risk API')
    .setDescription('Phase 2 MVP — see docs/architecture/openapi.yaml for the hand-authored contract this implements.')
    .setVersion('0.1.0-mvp')
    .addApiKey({ type: 'apiKey', name: 'X-PriceGuard-Api-Key', in: 'header' }, 'ApiKeyAuth')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  console.log(`PriceGuard API listening on port ${port} (Swagger UI at /api/docs)`);
}

bootstrap();
