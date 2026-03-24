import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import compression from 'compression';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

let cachedApp: any;

async function bootstrap() {
  if (!cachedApp) {
    const app = await NestFactory.create(AppModule);

    // Enable CORS
    app.enableCors({
      origin: (origin, callback) => {
        const allowedOrigins = [
          process.env.FRONTEND_URL,
          'http://localhost:3000',
        ].filter(Boolean);

        if (
          !origin ||
          allowedOrigins.includes(origin) ||
          origin.endsWith('.vercel.app')
        ) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    });

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // Apply compression (except for SSE)
    app.use(compression({
      filter: (req, res) => {
        if (res.getHeader('Content-Type') === 'text/event-stream') {
          return false;
        }
        return compression.filter(req, res);
      }
    }));

    // Increase JSON limit for Base64 image uploads
    app.use(json({ limit: '10mb' }));
    app.use(urlencoded({ extended: true, limit: '10mb' }));

    await app.init();
    cachedApp = app.getHttpAdapter().getInstance();
  }
  return cachedApp;
}

// For local development
if (process.env.NODE_ENV !== 'production') {
  const startLocal = async () => {
    const app = await NestFactory.create(AppModule);
    app.enableCors();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    const port = process.env.PORT || 3001;
    await app.listen(port);
    console.log(`✅ Local Server running on http://localhost:${port}`);
  };
  startLocal();
}

// Export the handler for Vercel
export default async (req: any, res: any) => {
  const app = await bootstrap();
  app(req, res);
};
