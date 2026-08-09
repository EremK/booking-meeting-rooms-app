import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

interface BookingResponseBody {
  id: string;
}

interface ErrorResponseBody {
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

function bookingId(response: request.Response): string {
  return (response.body as BookingResponseBody).id;
}

/**
 * API integration tests against a real running app + database for
 * the two flows the spec calls out explicitly -- booking creation and
 * cancellation -- plus the server-side validation failures around them.
 * Complements the mocked-Prisma unit tests in `BookingsService.spec.ts`,
 * which exercise the same rules without a real HTTP/DB round trip.
 */
describe('Booking API: creation, cancellation, validation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let roomId: string;
  let ownerEmail: string;
  let ownerCookie: string;
  let otherEmail: string;
  let otherCookie: string;

  async function registerAndConfirm(
    name: string,
    email: string,
  ): Promise<string> {
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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    const room = await prisma.room.create({
      data: { name: 'Booking Flows Test Room', floor: 98, capacity: 4 },
    });
    roomId = room.id;

    const suffix = Date.now();
    ownerEmail = `booking-flows-owner-${suffix}@example.com`;
    otherEmail = `booking-flows-other-${suffix}@example.com`;
    ownerCookie = await registerAndConfirm('Owner Tester', ownerEmail);
    otherCookie = await registerAndConfirm('Other Tester', otherEmail);
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { roomId } });
    await prisma.room.delete({ where: { id: roomId } });
    await prisma.user.deleteMany({
      where: { email: { in: [ownerEmail, otherEmail] } },
    });
    await app.close();
  });

  describe('POST /rooms/:roomId/bookings', () => {
    it('creates a valid booking and persists it', async () => {
      const response = await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', ownerCookie)
        .send({
          title: 'Синхронізація команди',
          startAt: '2031-06-02T07:00:00.000Z', // 10:00 Kyiv (EEST)
          endAt: '2031-06-02T08:00:00.000Z',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        title: 'Синхронізація команди',
        startAt: '2031-06-02T07:00:00.000Z',
        endAt: '2031-06-02T08:00:00.000Z',
      });

      const persisted = await prisma.booking.findUnique({
        where: { id: bookingId(response) },
      });
      expect(persisted).not.toBeNull();
      expect(persisted?.cancelledAt).toBeNull();
    });

    it('rejects an empty title', async () => {
      const response = await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', ownerCookie)
        .send({
          title: '',
          startAt: '2031-06-03T07:00:00.000Z',
          endAt: '2031-06-03T08:00:00.000Z',
        })
        .expect(400);

      expect((response.body as ErrorResponseBody).fieldErrors).toHaveProperty(
        'title',
      );
    });

    it('rejects a title over 100 characters', async () => {
      await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', ownerCookie)
        .send({
          title: 'A'.repeat(101),
          startAt: '2031-06-04T07:00:00.000Z',
          endAt: '2031-06-04T08:00:00.000Z',
        })
        .expect(400);
    });

    it('rejects a start time off the 30-minute grid', async () => {
      await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', ownerCookie)
        .send({
          title: 'Синк',
          startAt: '2031-06-05T07:10:00.000Z',
          endAt: '2031-06-05T07:40:00.000Z',
        })
        .expect(400);
    });

    it('rejects a duration shorter than 30 minutes', async () => {
      await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', ownerCookie)
        .send({
          title: 'Синк',
          startAt: '2031-06-06T07:00:00.000Z',
          endAt: '2031-06-06T07:15:00.000Z',
        })
        .expect(400);
    });

    it('rejects a duration longer than 4 hours', async () => {
      await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', ownerCookie)
        .send({
          title: 'Синк',
          startAt: '2031-06-07T07:00:00.000Z',
          endAt: '2031-06-07T11:30:00.000Z',
        })
        .expect(400);
    });

    it('rejects a booking outside office hours', async () => {
      // 20:00-21:00 Kyiv -- after the 19:00 close.
      await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', ownerCookie)
        .send({
          title: 'Синк',
          startAt: '2031-06-08T17:00:00.000Z',
          endAt: '2031-06-08T18:00:00.000Z',
        })
        .expect(400);
    });

    it('rejects a booking in the past', async () => {
      const start = new Date(Date.now() - 60 * 60 * 1000);
      const end = new Date(Date.now() - 30 * 60 * 1000);
      await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', ownerCookie)
        .send({
          title: 'Синк',
          startAt: start.toISOString(),
          endAt: end.toISOString(),
        })
        .expect(400);
    });

    it('rejects end not after start', async () => {
      await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', ownerCookie)
        .send({
          title: 'Синк',
          startAt: '2031-06-09T07:00:00.000Z',
          endAt: '2031-06-09T07:00:00.000Z',
        })
        .expect(400);
    });

    it('rejects a booking that overlaps an existing one', async () => {
      await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', ownerCookie)
        .send({
          title: 'Перше бронювання',
          startAt: '2031-06-10T07:00:00.000Z',
          endAt: '2031-06-10T08:00:00.000Z',
        })
        .expect(201);

      const conflict = await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', otherCookie)
        .send({
          title: 'Перетин',
          startAt: '2031-06-10T07:30:00.000Z',
          endAt: '2031-06-10T08:30:00.000Z',
        })
        .expect(409);

      expect((conflict.body as ErrorResponseBody).message).toContain(
        'заброньовано',
      );
    });

    it('accepts a booking merely adjacent to an existing one', async () => {
      // Continues from the previous test's 07:00-08:00 booking in the same room.
      await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', otherCookie)
        .send({
          title: 'Впритул',
          startAt: '2031-06-10T08:00:00.000Z',
          endAt: '2031-06-10T09:00:00.000Z',
        })
        .expect(201);
    });

    it('returns 404 for an unknown room', async () => {
      await request(app.getHttpServer())
        .post('/rooms/00000000-0000-0000-0000-000000000000/bookings')
        .set('Cookie', ownerCookie)
        .send({
          title: 'Синк',
          startAt: '2031-06-11T07:00:00.000Z',
          endAt: '2031-06-11T08:00:00.000Z',
        })
        .expect(404);
    });

    it('returns 401 without a session cookie', async () => {
      await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .send({
          title: 'Синк',
          startAt: '2031-06-12T07:00:00.000Z',
          endAt: '2031-06-12T08:00:00.000Z',
        })
        .expect(401);
    });
  });

  describe('POST /bookings/:id/cancel', () => {
    it('lets the owner cancel their own booking and frees the slot', async () => {
      const created = await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', ownerCookie)
        .send({
          title: 'До скасування',
          startAt: '2031-06-13T07:00:00.000Z',
          endAt: '2031-06-13T08:00:00.000Z',
        })
        .expect(201);

      const cancelResponse = await request(app.getHttpServer())
        .post(`/bookings/${bookingId(created)}/cancel`)
        .set('Cookie', ownerCookie)
        .expect(200);
      expect(bookingId(cancelResponse)).toBe(bookingId(created));

      const persisted = await prisma.booking.findUnique({
        where: { id: bookingId(created) },
      });
      expect(persisted?.cancelledAt).not.toBeNull();

      // The slot is free again for anyone.
      await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', otherCookie)
        .send({
          title: 'Новий власник слоту',
          startAt: '2031-06-13T07:00:00.000Z',
          endAt: '2031-06-13T08:00:00.000Z',
        })
        .expect(201);
    });

    it("rejects cancelling someone else's booking, leaving it active", async () => {
      const created = await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', ownerCookie)
        .send({
          title: 'Чуже бронювання',
          startAt: '2031-06-14T07:00:00.000Z',
          endAt: '2031-06-14T08:00:00.000Z',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/bookings/${bookingId(created)}/cancel`)
        .set('Cookie', otherCookie)
        .expect(403);

      const persisted = await prisma.booking.findUnique({
        where: { id: bookingId(created) },
      });
      expect(persisted?.cancelledAt).toBeNull();
    });

    it('rejects cancelling an already-cancelled booking', async () => {
      const created = await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', ownerCookie)
        .send({
          title: 'Двічі скасувати',
          startAt: '2031-06-15T07:00:00.000Z',
          endAt: '2031-06-15T08:00:00.000Z',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/bookings/${bookingId(created)}/cancel`)
        .set('Cookie', ownerCookie)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/bookings/${bookingId(created)}/cancel`)
        .set('Cookie', ownerCookie)
        .expect(409);
    });

    it('returns 404 for an unknown booking', async () => {
      await request(app.getHttpServer())
        .post('/bookings/00000000-0000-0000-0000-000000000000/cancel')
        .set('Cookie', ownerCookie)
        .expect(404);
    });

    it('returns 401 without a session cookie', async () => {
      const created = await request(app.getHttpServer())
        .post(`/rooms/${roomId}/bookings`)
        .set('Cookie', ownerCookie)
        .send({
          title: 'Без сесії',
          startAt: '2031-06-16T07:00:00.000Z',
          endAt: '2031-06-16T08:00:00.000Z',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/bookings/${bookingId(created)}/cancel`)
        .expect(401);
    });
  });
});
