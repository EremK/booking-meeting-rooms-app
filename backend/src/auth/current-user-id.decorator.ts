import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/** Only usable behind JwtAuthGuard, which populates request.userId. */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.userId as string;
  },
);
