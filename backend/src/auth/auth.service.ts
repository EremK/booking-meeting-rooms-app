import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { normalizeEmail } from '../common/normalize-email';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_SALT_ROUNDS = 10;
const INVALID_CREDENTIALS_MESSAGE = 'Невірний email або пароль';
const PRISMA_UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';
const DEFAULT_JWT_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<PublicUser> {
    const email = normalizeEmail(dto.email);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Такий email вже зареєстрований');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: { name: dto.name, email, passwordHash },
      });
      return toPublicUser(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PRISMA_UNIQUE_CONSTRAINT_ERROR_CODE
      ) {
        throw new ConflictException('Такий email вже зареєстрований');
      }
      throw error;
    }
  }

  async validateCredentials(dto: LoginDto): Promise<PublicUser> {
    const email = normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    return toPublicUser(user);
  }

  issueSessionToken(userId: string): string {
    const expiresInSeconds =
      Number(this.configService.get<string>('JWT_EXPIRES_IN_SECONDS')) ||
      DEFAULT_JWT_EXPIRES_IN_SECONDS;
    return this.jwtService.sign(
      { sub: userId },
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: expiresInSeconds,
      },
    );
  }

  async getUserById(id: string): Promise<PublicUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? toPublicUser(user) : null;
  }
}

function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
}): PublicUser {
  return { id: user.id, name: user.name, email: user.email };
}
