import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

// Prisma trả id dạng BigInt mà JSON.stringify không xử lý được.
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const server = express();

  // CORS phải đứng trước Nest để preflight OPTIONS cũng nhận Access-Control-Allow-Credentials,
  // nếu không thì withCredentials phía FE sẽ fail ngay ở bước preflight.
  const allowedOrigins = [
    ...(process.env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
    process.env.FRONTEND_URL ?? '',
    'http://localhost:5173',
  ].filter(Boolean);
  const isProduction = process.env.NODE_ENV === 'production';

  server.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true); // same-origin / curl
        if (!isProduction || allowedOrigins.includes(origin)) return callback(null, origin);
        logger.warn(`CORS chặn origin: ${origin}`);
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With', 'X-CSRF-Token'],
      optionsSuccessStatus: 204,
    }),
  );

  const app = await NestFactory.create(AppModule, new (await import('@nestjs/platform-express')).ExpressAdapter(server));
  const config = app.get(ConfigService);

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  const apiPrefix = config.get<string>('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('VCB Video Agent API')
      .setDescription('Auth, users và gateway sang AI service')
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'JWT-auth')
      .build();
    SwaggerModule.setup(`${apiPrefix}/docs`, app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  const port = Number(config.get<string>('PORT', '3001'));
  await app.listen(port);
  logger.log(`VCB_BE chạy tại http://localhost:${port}/${apiPrefix}`);
}

void bootstrap().catch((error: Error & { errorCode?: string }) => {
  // Prisma ném kèm cả bundle runtime vào stack; chỉ log phần người vận hành cần đọc.
  const logger = new Logger('Bootstrap');
  if (error.errorCode === 'P1001') {
    logger.error(`Không khởi động được: ${error.message.split('\n')[0]}`);
    logger.error('Kiểm tra Postgres đã chạy chưa và DATABASE_URL trong .env đã đúng chưa.');
  } else {
    logger.error(`Không khởi động được: ${error.message}`);
  }
  process.exit(1);
});
