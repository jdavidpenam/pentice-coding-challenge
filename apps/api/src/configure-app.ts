import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type NextFunction, type Request, type Response } from 'express';
import { bodyParserErrorHandler, ErrorFilter } from './common/error-response.js';

/** Shared by main.ts and tests so tests exercise the same HTTP behavior. Create the app with `bodyParser: false`. */
export function configureApp(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '16kb', strict: true }));
  app.use(bodyParserErrorHandler);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ErrorFilter());
}
