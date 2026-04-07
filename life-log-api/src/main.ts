import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const rawOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:4301';
  // 支援多個來源（逗號分隔）
  const allowedOrigins = rawOrigin.split(',').map((o) => o.trim());
  app.enableCors({
    origin: (origin, callback) => {
      // 無 origin（如 curl/Postman）或符合白名單，才放行
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, origin ?? '*');
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Life-Log API running on http://0.0.0.0:${port}`);
}
bootstrap();
