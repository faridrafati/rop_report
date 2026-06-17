import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Allow cross-origin requests from the web client.
  app.enableCors();

  // Validate & transform all incoming payloads globally.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Everything is served under /api.
  app.setGlobalPrefix('api');

  // OpenAPI / Swagger docs at /api/docs.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('DrillIQ API')
    .setDescription('DrillIQ drill-bit performance & DDR analytics API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.API_PORT) || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`DrillIQ API listening on http://localhost:${port}/api`);
}

void bootstrap();
