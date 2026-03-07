import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import * as express from 'express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

type ExpressHandler = (req: Request, res: Response) => void;

let cachedHandler: ExpressHandler | null = null;

async function getHandler(): Promise<ExpressHandler> {
  if (cachedHandler) {
    return cachedHandler;
  }

  const expressApp = express();
  const nestApp = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
  configureApp(nestApp);
  await nestApp.init();

  cachedHandler = expressApp;
  return cachedHandler;
}

export default async function handler(req: Request, res: Response) {
  const app = await getHandler();
  return app(req, res);
}
