import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthService, PublicUser } from './auth.service';
import { SESSION_COOKIE_NAME } from './auth.constants';
import { CurrentUserId } from './current-user-id.decorator';
import { ConfirmEmailDto } from './dto/confirm-email.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

const SESSION_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const user = await this.authService.register(dto);
    this.setSessionCookie(res, this.authService.issueSessionToken(user.id));
    return user;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const user = await this.authService.validateCredentials(dto);
    this.setSessionCookie(res, this.authService.issueSessionToken(user.id));
    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response): { success: true } {
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { success: true };
  }

  /** Bonus (BONUS-2): no auth guard -- the link is meant to work from a cold click, session or not. */
  @Post('confirm-email')
  @HttpCode(HttpStatus.OK)
  confirmEmail(@Body() dto: ConfirmEmailDto): Promise<PublicUser> {
    return this.authService.confirmEmail(dto.token);
  }

  @Post('resend-confirmation')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async resendConfirmation(
    @CurrentUserId() userId: string,
  ): Promise<{ success: true }> {
    await this.authService.resendConfirmation(userId);
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUserId() userId: string): Promise<PublicUser> {
    const user = await this.authService.getUserById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  private setSessionCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_COOKIE_MAX_AGE_MS,
    });
  }
}
