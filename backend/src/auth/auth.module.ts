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
      // Broad per-IP abuse ceiling. Deliberately high: a whole office can sit
      // behind one NAT IP, so this must only catch scripted abuse, never
      // normal shared use. Per-account limits below do the real work.
      {
        name: 'ip',
        ttl: 60_000,
        limit: 100,
      },
      // Per-account limits. Every guarded route sets its own value via
      // @Throttle; this is the conservative fallback a future route inherits
      // if it forgets to, so the default must be protective rather than lax.
      {
        name: 'account',
        ttl: 60_000,
        limit: 10,
        getTracker: getAccountTracker,
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, ThrottlerGuard],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
