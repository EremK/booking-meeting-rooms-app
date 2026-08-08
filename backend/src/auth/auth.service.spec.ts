import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
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
  emailConfirmedAt?: Date | null;
  emailConfirmationToken?: string | null;
  emailConfirmationTokenExpiresAt?: Date | null;
};

function createMockPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
          return Promise.resolve({
            id: 'user-1',
            emailConfirmedAt: null,
            ...data,
          });
        },
      );
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

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
        emailConfirmed: false,
      });
      logSpy.mockRestore();
    });

    it('issues an unconfirmed account with a single-use confirmation token, printed to the server log', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      let createdData: Omit<MockUser, 'id'> | undefined;
      prisma.user.create.mockImplementation(
        ({ data }: { data: Omit<MockUser, 'id'> }) => {
          createdData = data;
          return Promise.resolve({
            id: 'user-1',
            emailConfirmedAt: null,
            ...data,
          });
        },
      );
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await authService.register({
        name: 'Марія Шевченко',
        email: 'maria.shevchenko@example.com',
        password: 'password123',
      });

      expect(createdData?.emailConfirmationToken).toEqual(expect.any(String));
      expect(createdData?.emailConfirmationToken?.length).toBeGreaterThan(20);
      expect(
        createdData?.emailConfirmationTokenExpiresAt?.getTime(),
      ).toBeGreaterThan(Date.now());
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(createdData?.emailConfirmationToken ?? ''),
      );
      logSpy.mockRestore();
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
        emailConfirmedAt: new Date('2026-08-01T00:00:00.000Z'),
      });

      const result = await authService.validateCredentials({
        email: '  Maria.Shevchenko@Example.com',
        password: 'password123',
      });

      expect(result).toEqual({
        id: 'user-1',
        name: 'Марія Шевченко',
        email: 'maria.shevchenko@example.com',
        emailConfirmed: true,
      });
    });

    it('logs in successfully even when the email is not yet confirmed (only booking is gated, not login)', async () => {
      const passwordHash = await bcrypt.hash('password123', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Марія Шевченко',
        email: 'maria.shevchenko@example.com',
        passwordHash,
        emailConfirmedAt: null,
      });

      const result = await authService.validateCredentials({
        email: 'maria.shevchenko@example.com',
        password: 'password123',
      });

      expect(result.emailConfirmed).toBe(false);
    });
  });

  describe('confirmEmail', () => {
    const UNCONFIRMED_USER = {
      id: 'user-1',
      name: 'Марія Шевченко',
      email: 'maria.shevchenko@example.com',
      passwordHash: 'irrelevant',
      emailConfirmedAt: null as Date | null,
      emailConfirmationToken: 'valid-token',
      emailConfirmationTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };

    it('rejects an unknown token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        authService.confirmEmail('bogus-token'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an expired token', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...UNCONFIRMED_USER,
        emailConfirmationTokenExpiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        authService.confirmEmail(UNCONFIRMED_USER.emailConfirmationToken),
      ).rejects.toThrow('Термін дії посилання сплив');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('confirms the account and clears the token so it cannot be replayed', async () => {
      prisma.user.findUnique.mockResolvedValue(UNCONFIRMED_USER);
      interface UpdateArgs {
        where: { id: string };
        data: {
          emailConfirmedAt: Date;
          emailConfirmationToken: null;
          emailConfirmationTokenExpiresAt: null;
        };
      }
      let updateArgs: UpdateArgs | undefined;
      prisma.user.update.mockImplementation((args: UpdateArgs) => {
        updateArgs = args;
        return Promise.resolve({ ...UNCONFIRMED_USER, ...args.data });
      });

      const result = await authService.confirmEmail(
        UNCONFIRMED_USER.emailConfirmationToken,
      );

      expect(result.emailConfirmed).toBe(true);
      expect(updateArgs?.where).toEqual({ id: UNCONFIRMED_USER.id });
      expect(updateArgs?.data.emailConfirmationToken).toBeNull();
      expect(updateArgs?.data.emailConfirmationTokenExpiresAt).toBeNull();
    });
  });

  describe('resendConfirmation', () => {
    it('rejects an already-confirmed account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'maria.shevchenko@example.com',
        emailConfirmedAt: new Date(),
      });
      await expect(
        authService.resendConfirmation('user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('issues a fresh token and logs a new confirmation link', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'maria.shevchenko@example.com',
        emailConfirmedAt: null,
      });
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      interface UpdateArgs {
        data: { emailConfirmationToken: string };
      }
      let updateArgs: UpdateArgs | undefined;
      prisma.user.update.mockImplementation((args: UpdateArgs) => {
        updateArgs = args;
        return Promise.resolve(args);
      });

      await authService.resendConfirmation('user-1');

      expect(updateArgs?.data.emailConfirmationToken).toEqual(
        expect.any(String),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(updateArgs?.data.emailConfirmationToken ?? ''),
      );
      logSpy.mockRestore();
    });
  });
});
