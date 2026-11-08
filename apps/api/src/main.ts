import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import { join } from 'node:path';
import { AppModule } from './app.module.js';

/**
 * Serves the exported web app (`expo export`) next to the API, so one process answers both `/` and
 * `/v1` (used by the packaged service). Client-side routes fall back to the app shell.
 */
function serveWeb(app: INestApplication, dir: string) {
  const server = app.getHttpAdapter().getInstance() as express.Express;
  server.use((req, res, next) => {
    // expo-sqlite on web needs SharedArrayBuffer, which requires cross-origin isolation.
    if (!req.path.startsWith('/v1/')) {
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    }
    next();
  });
  server.use(
    express.static(dir, {
      maxAge: '1h',
      setHeaders: (res, file) => file.endsWith('.html') && res.setHeader('Cache-Control', 'no-cache'),
    }),
  );
  server.get(/^\/(?!v1\/).*/, (_req, res) => res.sendFile(join(dir, 'index.html')));
}

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('v1');
  app.enableCors({ origin: (process.env.CORS_ORIGINS ?? 'http://localhost:8081').split(',') });
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('OpenBook API').setVersion('1').addBearerAuth().build());
  SwaggerModule.setup('v1/docs', app, doc, { jsonDocumentUrl: 'v1/openapi.json' });
  if (process.env.OPENBOOK_WEB_DIR) serveWeb(app, process.env.OPENBOOK_WEB_DIR);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await createApp();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`OpenBook API listening on http://localhost:${port}/v1`);
}
