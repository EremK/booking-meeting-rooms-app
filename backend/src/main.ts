import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

/** Grouped by field so the frontend can show each message next to its input (UI-3). */
function toFieldErrors(errors: ValidationError[]): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const error of errors) {
    if (error.constraints) {
      fieldErrors[error.property] = Object.values(error.constraints);
    }
  }
  return fieldErrors;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          message: 'Помилка валідації',
          fieldErrors: toFieldErrors(errors),
        }),
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
