import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

let cachedApp: any;

async function bootstrap() {
  if (!cachedApp) {
    const app = await NestFactory.create(AppModule);

    // Enable CORS
    app.enableCors({
      origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        'https://family-calendar-frontend.vercel.app', // Update with real production URL if known
      ],
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
