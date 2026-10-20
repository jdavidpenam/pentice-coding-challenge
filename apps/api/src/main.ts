import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';
import { configureApp } from './configure-app.js';
import { seedDemoData } from './seed.js';

const config = loadConfig(process.env);
const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), { bodyParser: false });
configureApp(app);
if (config.seedDemoData) seedDemoData(app);
// Local only: bind to loopback. The web app reaches the API through the Vite dev proxy (same origin, no CORS).
await app.listen(config.port, '127.0.0.1');
console.log(`API on http://127.0.0.1:${config.port}/api (dev tools: ${config.devTools ? 'on' : 'off'})`);
