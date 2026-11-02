import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('v1');
  app.enableCors({ origin: (process.env.CORS_ORIGINS ?? 'http://localhost:8081').split(',') });
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('OpenBook API').setVersion('1').addBearerAuth().build());
  SwaggerModule.setup('v1/docs', app, doc, { jsonDocumentUrl: 'v1/openapi.json' });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await createApp();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`OpenBook API listening on http://localhost:${port}/v1`);
}
