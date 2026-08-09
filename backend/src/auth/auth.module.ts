import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { getAccountTracker } from './account-throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    JwtModule.register({}),
    ThrottlerModule.forRoot([
      {
        name: 'ip',
        ttl: 60_000,
        limit: 100,
      },
      {
        name: 'account',
        ttl: 60_000,
        limit: 1000,
        getTracker: getAccountTracker,
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, ThrottlerGuard],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
