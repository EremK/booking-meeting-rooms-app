import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { SESSION_COOKIE_NAME } from './auth.constants';

const AUTH_REQUIRED_MESSAGE = 'Необхідна автентифікація';

interface SessionTokenPayload {
  sub: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies as Record<string, string> | undefined;
    const sessionToken = token?.[SESSION_COOKIE_NAME];
    if (!sessionToken) {
      throw new UnauthorizedException(AUTH_REQUIRED_MESSAGE);
    }

    try {
      const payload = await this.jwtService.verifyAsync<SessionTokenPayload>(
        sessionToken,
        {
          secret: this.configService.get<string>('JWT_SECRET'),
        },
      );
      request.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException(AUTH_REQUIRED_MESSAGE);
    }
  }
}
