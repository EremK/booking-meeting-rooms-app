import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * BONUS-4: two users clicking "book" on the same slot at the same time must
 * result in exactly one booking in the database. The applicationlevel
 * pre-check in BookingsService is not atomic with the insert (it's a
 * separate query), so this specifically exercises the real race window by
 * firing two concurrent HTTP requests and relying on the `bookings_no_overlap`
 * database EXCLUDE constraint as the actual guarantee.
 */
describe('Booking race-condition protection (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let roomId: string;
  let userEmail: string;
  let sessionCookie: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    const room = await prisma.room.create({
      data: { name: 'Race Test Room', floor: 99, capacity: 4 },
    });
    roomId = room.id;

    userEmail = `race-test-${Date.now()}@example.com`;
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Race Tester', email: userEmail, password: 'password123' })
      .expect(201);

    const setCookieHeader = registerResponse.headers[
      'set-cookie'
    ] as unknown as string[];
    sessionCookie = setCookieHeader[0].split(';')[0];

    // BONUS-2 blocks booking creation until email confirmation; this test
    // is about race-condition protection, not the confirmation flow, so
    // confirm directly rather than fishing the token out of a log line.
    await prisma.user.update({
      where: { email: userEmail },
      data: { emailConfirmedAt: new Date() },
    });
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { roomId } });
    await prisma.room.delete({ where: { id: roomId } });
    await prisma.user.deleteMany({ where: { email: userEmail } });
    await app.close();
  });

  it('lets exactly one of two concurrent requests for the same slot succeed', async () => {
    // A fixed future slot, valid per every booking rule (far future, 30-min
    // aligned, 1h duration, within office hours): 10:00-11:00 Kyiv (EEST, UTC+3).
    const startAt = '2030-06-03T07:00:00.000Z';
    const endAt = '2030-06-03T08:00:00.000Z';

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', sessionCookie)
        .send({ title: 'First click', startAt, endAt }),
      request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', sessionCookie)
        .send({ title: 'Second click', startAt, endAt }),
    ]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const survivors = await prisma.booking.findMany({
      where: { roomId, startAt: new Date(startAt), cancelledAt: null },
    });
    expect(survivors).toHaveLength(1);
  });
});
