import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

interface MyBookingsBody {
  items: Array<{ id: string; title: string; cancelledAt: string | null }>;
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
}

function body(response: request.Response): MyBookingsBody {
  return response.body as MyBookingsBody;
}

function titles(response: request.Response): string[] {
  return body(response).items.map((item) => item.title);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The "Мої бронювання" listing against a real app + database. The service-level
 * unit tests cover this with a mocked Prisma, which means the actual SQL the
 * section/includeCancelled filters compile to is only exercised here.
 */
describe('My bookings API: sections, cancelled filter, pagination (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let roomId: string;
  let ownerEmail: string;
  let ownerCookie: string;
  let otherEmail: string;
  let otherUserId: string;

  async function register(name: string, email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: 'password123' })
      .expect(201);
    await prisma.user.update({
      where: { email },
      data: { emailConfirmedAt: new Date() },
    });
    const setCookieHeader = response.headers[
      'set-cookie'
    ] as unknown as string[];
    return setCookieHeader[0].split(';')[0];
  }

  /** Inserted directly: past bookings can't be created through the API, which only accepts future times. */
  async function seedBooking(options: {
    userId: string;
    title: string;
    dayOffset: number;
    hour: number;
    cancelled?: boolean;
  }): Promise<void> {
    const start = new Date(Date.now() + options.dayOffset * DAY_MS);
    start.setUTCHours(options.hour, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    await prisma.booking.create({
      data: {
        roomId,
        userId: options.userId,
        title: options.title,
        startAt: start,
        endAt: end,
        cancelledAt: options.cancelled ? new Date() : null,
      },
    });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const room = await prisma.room.create({
      data: { name: 'My Bookings Test Room', floor: 97, capacity: 4 },
    });
    roomId = room.id;

    const suffix = Date.now();
    ownerEmail = `my-bookings-owner-${suffix}@example.com`;
    otherEmail = `my-bookings-other-${suffix}@example.com`;
    ownerCookie = await register('Owner Tester', ownerEmail);
    await register('Other Tester', otherEmail);
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: ownerEmail },
    });
    const other = await prisma.user.findUniqueOrThrow({
      where: { email: otherEmail },
    });
    otherUserId = other.id;

    // Distinct hours keep these from tripping the no-overlap exclusion constraint.
    await seedBooking({
      userId: owner.id,
      title: 'Минуле 1',
      dayOffset: -9,
      hour: 9,
    });
    await seedBooking({
      userId: owner.id,
      title: 'Минуле 2',
      dayOffset: -3,
      hour: 10,
    });
    await seedBooking({
      userId: owner.id,
      title: 'Минуле скасоване',
      dayOffset: -5,
      hour: 11,
      cancelled: true,
    });
    await seedBooking({
      userId: owner.id,
      title: 'Майбутнє 1',
      dayOffset: 3,
      hour: 9,
    });
    await seedBooking({
      userId: owner.id,
      title: 'Майбутнє 2',
      dayOffset: 5,
      hour: 10,
    });
    await seedBooking({
      userId: owner.id,
      title: 'Майбутнє 3',
      dayOffset: 7,
      hour: 11,
    });
    await seedBooking({
      userId: owner.id,
      title: 'Майбутнє скасоване',
      dayOffset: 4,
      hour: 12,
    });
    await prisma.booking.updateMany({
      where: { roomId, title: 'Майбутнє скасоване' },
      data: { cancelledAt: new Date() },
    });
    await seedBooking({
      userId: otherUserId,
      title: 'Чуже майбутнє',
      dayOffset: 6,
      hour: 13,
    });
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { roomId } });
    await prisma.room.delete({ where: { id: roomId } });
    await prisma.user.deleteMany({
      where: { email: { in: [ownerEmail, otherEmail] } },
    });
    await app.close();
  });

  describe('GET /bookings/me', () => {
    it("returns only the caller's own future, non-cancelled bookings, soonest first", async () => {
      const response = await request(app.getHttpServer())
        .get('/bookings/me?section=upcoming&page=1&pageSize=50')
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(titles(response)).toEqual([
        'Майбутнє 1',
        'Майбутнє 2',
        'Майбутнє 3',
      ]);
      expect(titles(response)).not.toContain('Чуже майбутнє');
      expect(titles(response)).not.toContain('Майбутнє скасоване');
    });

    it('returns only past, non-cancelled bookings, most recent first', async () => {
      const response = await request(app.getHttpServer())
        .get('/bookings/me?section=past&page=1&pageSize=50')
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(titles(response)).toEqual(['Минуле 2', 'Минуле 1']);
      expect(titles(response)).not.toContain('Минуле скасоване');
    });

    it('excludes cancelled bookings when includeCancelled is omitted', async () => {
      const response = await request(app.getHttpServer())
        .get('/bookings/me?section=upcoming&page=1&pageSize=50')
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(
        body(response).items.every((item) => item.cancelledAt === null),
      ).toBe(true);
    });

    it('includes cancelled bookings in "upcoming" when includeCancelled=true', async () => {
      const response = await request(app.getHttpServer())
        .get(
          '/bookings/me?section=upcoming&page=1&pageSize=50&includeCancelled=true',
        )
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(titles(response)).toContain('Майбутнє скасоване');
      expect(titles(response)).toHaveLength(4);
    });

    it('includes cancelled bookings in "past" when includeCancelled=true', async () => {
      const response = await request(app.getHttpServer())
        .get(
          '/bookings/me?section=past&page=1&pageSize=50&includeCancelled=true',
        )
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(titles(response)).toContain('Минуле скасоване');
      expect(titles(response)).toHaveLength(3);
    });

    it('treats includeCancelled=false the same as omitting it', async () => {
      const response = await request(app.getHttpServer())
        .get(
          '/bookings/me?section=upcoming&page=1&pageSize=50&includeCancelled=false',
        )
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(titles(response)).not.toContain('Майбутнє скасоване');
    });

    it('paginates and reports totalCount/hasMore against the filtered set', async () => {
      const first = await request(app.getHttpServer())
        .get('/bookings/me?section=upcoming&page=1&pageSize=2')
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(first.body).toMatchObject({
        page: 1,
        pageSize: 2,
        totalCount: 3,
        hasMore: true,
      });
      expect(titles(first)).toEqual(['Майбутнє 1', 'Майбутнє 2']);

      const second = await request(app.getHttpServer())
        .get('/bookings/me?section=upcoming&page=2&pageSize=2')
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(second.body).toMatchObject({ page: 2, hasMore: false });
      expect(titles(second)).toEqual(['Майбутнє 3']);
    });

    it('rejects an unknown section', async () => {
      await request(app.getHttpServer())
        .get('/bookings/me?section=cancelled')
        .set('Cookie', ownerCookie)
        .expect(400);
    });

    it('rejects a pageSize above the allowed maximum', async () => {
      await request(app.getHttpServer())
        .get('/bookings/me?section=upcoming&pageSize=1000')
        .set('Cookie', ownerCookie)
        .expect(400);
    });

    it('returns 401 without a session cookie', async () => {
      await request(app.getHttpServer())
        .get('/bookings/me?section=upcoming')
        .expect(401);
    });
  });
});
