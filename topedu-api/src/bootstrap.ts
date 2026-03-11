import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';

export function configureApp(app: INestApplication) {
  const configService = app.get(ConfigService);
  const frontendOrigin = configService.get<string>('FRONTEND_ORIGIN', 'https://topedu.co.nz');

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors({
    origin: frontendOrigin,
    credentials: true,
  });
}
