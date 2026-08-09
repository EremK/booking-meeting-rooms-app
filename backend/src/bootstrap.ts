import {
  BadRequestException,
  type INestApplication,
  type ValidationError,
} from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/** Grouped by field so the frontend can show each message next to its input. */
function toFieldErrors(errors: ValidationError[]): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const error of errors) {
    if (error.constraints) {
      fieldErrors[error.property] = Object.values(error.constraints);
    }
  }
  return fieldErrors;
}

/**
 * Middleware/pipes/CORS shared by the real server (`main.ts`) and the e2e
 * test suites, so integration tests exercise the exact same request
 * pipeline -- including the custom `fieldErrors` validation-error shape --
 * rather than a hand-rolled approximation that could silently drift from it.
 */
export function configureApp(app: INestApplication): void {
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
}
