import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

type MockUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
};

function createMockPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
}

describe('AuthService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let authService: AuthService;

  beforeEach(() => {
    prisma = createMockPrisma();
    const jwtService = new JwtService({});
    const configService = new ConfigService({ JWT_SECRET: 'test-secret' });
    authService = new AuthService(
      prisma as unknown as PrismaService,
      jwtService,
      configService,
    );
  });

  describe('register', () => {
    it('normalizes email casing/whitespace and stores a bcrypt hash, not the raw password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      let createdData: Omit<MockUser, 'id'> | undefined;
      prisma.user.create.mockImplementation(
        ({ data }: { data: Omit<MockUser, 'id'> }) => {
          createdData = data;
          return Promise.resolve({ id: 'user-1', ...data });
        },
      );

      const result = await authService.register({
        name: 'Марія Шевченко',
        email: '  Maria.Shevchenko@Example.com  ',
        password: 'password123',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'maria.shevchenko@example.com' },
      });
      expect(createdData?.email).toBe('maria.shevchenko@example.com');
      expect(createdData?.passwordHash).not.toBe('password123');
      expect(
        await bcrypt.compare('password123', createdData?.passwordHash ?? ''),
      ).toBe(true);
      expect(result).toEqual({
        id: 'user-1',
        name: 'Марія Шевченко',
        email: 'maria.shevchenko@example.com',
      });
    });

    it('rejects registration when the (normalized) email is already taken', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        name: 'Остап Гайдамака',
        email: 'ostap.haidamaka@example.com',
        passwordHash: 'irrelevant',
      });

      await expect(
        authService.register({
          name: 'Остап Гайдамака',
          email: 'Ostap.Haidamaka@example.com',
          password: 'password123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('validateCredentials', () => {
    it('rejects unknown emails with a generic message (no user enumeration)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.validateCredentials({
          email: 'nobody@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow('Невірний email або пароль');
    });

    it('rejects a wrong password with the same generic message', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Марія Шевченко',
        email: 'maria.shevchenko@example.com',
        passwordHash,
      });

      await expect(
        authService.validateCredentials({
          email: 'maria.shevchenko@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns the public user shape (no password hash) on success', async () => {
      const passwordHash = await bcrypt.hash('password123', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Марія Шевченко',
        email: 'maria.shevchenko@example.com',
        passwordHash,
      });

      const result = await authService.validateCredentials({
        email: '  Maria.Shevchenko@Example.com',
        password: 'password123',
      });

      expect(result).toEqual({
        id: 'user-1',
        name: 'Марія Шевченко',
        email: 'maria.shevchenko@example.com',
      });
    });
  });
});
