import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';

const ROOM = { id: 'room-1', name: 'Альфа', floor: 1, capacity: 4 };
const USER = { id: 'user-1', name: 'Ганна Кузьменко' };
const OTHER_USER = { id: 'user-2', name: 'Остап Гайдамака' };

// A fixed "now" (Tuesday, Kyiv summer time) so booking-time math is deterministic
// regardless of when the suite actually runs.
const FIXED_NOW = new Date('2026-08-04T08:00:00.000Z');

function createMockPrisma() {
  const prisma = {
    room: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    booking: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    bookingSeries: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  // Mirrors Prisma's two `$transaction` call shapes closely enough for unit
  // tests: an interactive callback run against this same mock client, or an
  // array of already-issued mock-promise "queries" run concurrently.
  prisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: typeof prisma) => unknown)(prisma)
      : Promise.all(arg as Promise<unknown>[]),
  );
  return prisma;
}

function createMockNotificationsService() {
  return {
    purgeUndeliveredNotificationsForCancellations: jest
      .fn()
      .mockResolvedValue(undefined),
  };
}

interface FindManyArgs {
  where: {
    userId: string;
    endAt?: { gt?: Date; lte?: Date };
    cancelledAt?: null | { not: null };
  };
  orderBy: { startAt: 'asc' | 'desc' } | { cancelledAt: 'asc' | 'desc' };
  skip: number;
  take: number;
}

/** Captures the args a mocked `findMany` was called with, while still resolving to `resolvedValue`. */
function captureFindManyArgs(
  mockFindMany: ReturnType<typeof createMockPrisma>['booking']['findMany'],
  resolvedValue: unknown[],
) {
  const captured: { args?: FindManyArgs } = {};
  mockFindMany.mockImplementation((args: FindManyArgs) => {
    captured.args = args;
    return Promise.resolve(resolvedValue);
  });
  return captured;
}

describe('BookingsService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let notificationsService: ReturnType<typeof createMockNotificationsService>;
  let service: BookingsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);
    prisma = createMockPrisma();
    notificationsService = createMockNotificationsService();
    prisma.room.findUnique.mockResolvedValue(ROOM);
    prisma.user.findUnique.mockResolvedValue({ emailConfirmedAt: new Date() });
    prisma.booking.findMany.mockResolvedValue([]);
    service = new BookingsService(
      prisma as unknown as PrismaService,
      notificationsService as unknown as NotificationsService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects an unknown room', async () => {
    prisma.room.findUnique.mockResolvedValue(null);
    await expect(
      service.createBooking('missing-room', USER.id, {
        title: 'Синк',
        startAt: '2026-08-05T07:00:00.000Z',
        endAt: '2026-08-05T08:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects booking creation when the user's email isn't confirmed", async () => {
    prisma.user.findUnique.mockResolvedValue({ emailConfirmedAt: null });
    await expect(
      service.createBooking(ROOM.id, USER.id, {
        title: 'Синк',
        startAt: '2026-08-05T07:00:00.000Z',
        endAt: '2026-08-05T08:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('rejects when end is not after start', async () => {
    await expect(
      service.createBooking(ROOM.id, USER.id, {
        title: 'Синк',
        startAt: '2026-08-05T08:00:00.000Z',
        endAt: '2026-08-05T08:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a start time in the past', async () => {
    await expect(
      service.createBooking(ROOM.id, USER.id, {
        title: 'Синк',
        startAt: '2026-08-04T07:00:00.000Z',
        endAt: '2026-08-04T07:30:00.000Z',
      }),
    ).rejects.toThrow('Час бронювання має бути в майбутньому');
  });

  it('rejects a duration shorter than 30 minutes', async () => {
    await expect(
      service.createBooking(ROOM.id, USER.id, {
        title: 'Синк',
        startAt: '2026-08-05T07:00:00.000Z',
        endAt: '2026-08-05T07:15:00.000Z',
      }),
    ).rejects.toThrow(
      'Тривалість бронювання має бути від 30 хвилин до 4 годин',
    );
  });

  it('rejects a duration longer than 4 hours', async () => {
    await expect(
      service.createBooking(ROOM.id, USER.id, {
        title: 'Синк',
        startAt: '2026-08-05T07:00:00.000Z',
        endAt: '2026-08-05T11:30:00.000Z',
      }),
    ).rejects.toThrow(
      'Тривалість бронювання має бути від 30 хвилин до 4 годин',
    );
  });

  it('rejects times off the 30-minute grid', async () => {
    await expect(
      service.createBooking(ROOM.id, USER.id, {
        title: 'Синк',
        startAt: '2026-08-05T07:10:00.000Z',
        endAt: '2026-08-05T07:40:00.000Z',
      }),
    ).rejects.toThrow('Час має бути кратним 30 хвилинам');
  });

  it('rejects a booking outside office hours', async () => {
    // 20:00-21:00 Kyiv -- after the 19:00 close.
    await expect(
      service.createBooking(ROOM.id, USER.id, {
        title: 'Синк',
        startAt: '2026-08-05T17:00:00.000Z',
        endAt: '2026-08-05T18:00:00.000Z',
      }),
    ).rejects.toThrow('робочі години');
  });

  it('rejects a booking that overlaps an existing one', async () => {
    prisma.booking.findMany.mockResolvedValue([
      {
        startAt: new Date('2026-08-05T07:00:00.000Z'),
        endAt: new Date('2026-08-05T08:00:00.000Z'),
      },
    ]);
    await expect(
      service.createBooking(ROOM.id, USER.id, {
        title: 'Синк',
        startAt: '2026-08-05T07:30:00.000Z',
        endAt: '2026-08-05T08:30:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('accepts a booking that is merely adjacent to an existing one', async () => {
    prisma.booking.findMany.mockResolvedValue([
      {
        startAt: new Date('2026-08-05T07:00:00.000Z'),
        endAt: new Date('2026-08-05T08:00:00.000Z'),
      },
    ]);
    prisma.booking.create.mockResolvedValue({
      id: 'booking-2',
      title: 'Демо',
      startAt: new Date('2026-08-05T08:00:00.000Z'),
      endAt: new Date('2026-08-05T09:00:00.000Z'),
      user: USER,
    });

    const result = await service.createBooking(ROOM.id, USER.id, {
      title: 'Демо',
      startAt: '2026-08-05T08:00:00.000Z',
      endAt: '2026-08-05T09:00:00.000Z',
    });

    expect(result.id).toBe('booking-2');
  });

  it('translates a database-level exclusion-constraint rejection into the same conflict message (race-condition fallback)', async () => {
    // The pre-check query found nothing (this is exactly the race: two
    // requests both pass it before either commits), but the actual INSERT
    // is rejected by the `bookings_no_overlap` EXCLUDE constraint.
    const exclusionViolation = Object.create(
      Prisma.PrismaClientKnownRequestError.prototype,
    ) as Record<string, unknown>;
    exclusionViolation.message = 'Database error';
    exclusionViolation.code = 'P2039';
    exclusionViolation.meta = {
      driverAdapterError: { cause: { originalCode: '23P01' } },
    };
    prisma.booking.create.mockRejectedValue(exclusionViolation);

    await expect(
      service.createBooking(ROOM.id, USER.id, {
        title: 'Синк',
        startAt: '2026-08-05T07:00:00.000Z',
        endAt: '2026-08-05T08:00:00.000Z',
      }),
    ).rejects.toThrow('Цей час уже заброньовано');
  });

  it('re-throws unrelated database errors from create as-is', async () => {
    const unrelatedError = new Error('connection lost');
    prisma.booking.create.mockRejectedValue(unrelatedError);

    await expect(
      service.createBooking(ROOM.id, USER.id, {
        title: 'Синк',
        startAt: '2026-08-05T07:00:00.000Z',
        endAt: '2026-08-05T08:00:00.000Z',
      }),
    ).rejects.toThrow('connection lost');
  });

  it('creates a valid booking and returns the expected shape', async () => {
    interface CreateData {
      roomId: string;
      userId: string;
      title: string;
      startAt: Date;
      endAt: Date;
    }
    let createdData: CreateData | undefined;
    prisma.booking.create.mockImplementation(
      ({ data }: { data: CreateData }) => {
        createdData = data;
        return Promise.resolve({
          id: 'booking-1',
          title: 'Синхронізація команди',
          startAt: new Date('2026-08-05T07:00:00.000Z'),
          endAt: new Date('2026-08-05T08:00:00.000Z'),
          user: USER,
        });
      },
    );

    const result = await service.createBooking(ROOM.id, USER.id, {
      title: 'Синхронізація команди',
      startAt: '2026-08-05T07:00:00.000Z',
      endAt: '2026-08-05T08:00:00.000Z',
    });

    expect(result).toEqual({
      id: 'booking-1',
      title: 'Синхронізація команди',
      startAt: '2026-08-05T07:00:00.000Z',
      endAt: '2026-08-05T08:00:00.000Z',
      userId: USER.id,
      userName: USER.name,
    });
    expect(createdData?.roomId).toBe(ROOM.id);
    expect(createdData?.userId).toBe(USER.id);
    expect(createdData?.title).toBe('Синхронізація команди');
    expect(createdData?.startAt).toBeInstanceOf(Date);
    expect(createdData?.endAt).toBeInstanceOf(Date);
  });

  describe('createBookingSeries', () => {
    const SERIES_DTO = {
      title: 'Щотижневий синк',
      startAt: '2026-08-05T07:00:00.000Z', // Wed 10:00 Kyiv
      endAt: '2026-08-05T08:00:00.000Z', // Wed 11:00 Kyiv
      occurrenceCount: 3,
    };

    function mockCreatedBooking(occurrenceIndex: number) {
      const weekOffsetMs = occurrenceIndex * 7 * 24 * 60 * 60 * 1000;
      return {
        id: `booking-series-${occurrenceIndex}`,
        title: SERIES_DTO.title,
        startAt: new Date(
          new Date(SERIES_DTO.startAt).getTime() + weekOffsetMs,
        ),
        endAt: new Date(new Date(SERIES_DTO.endAt).getTime() + weekOffsetMs),
        user: USER,
      };
    }

    it('rejects an unknown room', async () => {
      prisma.room.findUnique.mockResolvedValue(null);
      await expect(
        service.createBookingSeries('missing-room', USER.id, SERIES_DTO),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects series creation when the user's email isn't confirmed", async () => {
      prisma.user.findUnique.mockResolvedValue({ emailConfirmedAt: null });
      await expect(
        service.createBookingSeries(ROOM.id, USER.id, SERIES_DTO),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.bookingSeries.create).not.toHaveBeenCalled();
    });

    it('rejects invalid timing on the first occurrence, same as a single booking', async () => {
      await expect(
        service.createBookingSeries(ROOM.id, USER.id, {
          ...SERIES_DTO,
          startAt: '2026-08-04T07:00:00.000Z', // in the past relative to FIXED_NOW
          endAt: '2026-08-04T07:30:00.000Z',
        }),
      ).rejects.toThrow('Час бронювання має бути в майбутньому');
    });

    it('rejects when any occurrence overlaps an existing booking', async () => {
      // Occurrences are checked in order; the 3rd (last) collides, the 1st
      // and 2nd are otherwise free.
      prisma.booking.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            startAt: new Date('2026-08-19T07:00:00.000Z'),
            endAt: new Date('2026-08-19T08:00:00.000Z'),
          },
        ]);

      await expect(
        service.createBookingSeries(ROOM.id, USER.id, SERIES_DTO),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.bookingSeries.create).not.toHaveBeenCalled();
    });

    it('creates the series and every occurrence, 7 days apart, inside one transaction', async () => {
      prisma.bookingSeries.create.mockResolvedValue({
        id: 'series-1',
        title: SERIES_DTO.title,
        occurrenceCount: SERIES_DTO.occurrenceCount,
      });
      prisma.booking.create.mockImplementation(
        ({ data }: { data: { occurrenceIndex: number } }) =>
          Promise.resolve(mockCreatedBooking(data.occurrenceIndex)),
      );

      const result = await service.createBookingSeries(
        ROOM.id,
        USER.id,
        SERIES_DTO,
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('series-1');
      expect(result.occurrenceCount).toBe(3);
      expect(result.occurrences).toHaveLength(3);
      expect(result.occurrences[0].startAt).toBe('2026-08-05T07:00:00.000Z');
      expect(result.occurrences[1].startAt).toBe('2026-08-12T07:00:00.000Z');
      expect(result.occurrences[2].startAt).toBe('2026-08-19T07:00:00.000Z');
    });

    it('translates a database-level exclusion-constraint rejection into a conflict, rolling back the whole series', async () => {
      const exclusionViolation = Object.create(
        Prisma.PrismaClientKnownRequestError.prototype,
      ) as Record<string, unknown>;
      exclusionViolation.message = 'Database error';
      exclusionViolation.code = 'P2039';
      exclusionViolation.meta = {
        driverAdapterError: { cause: { originalCode: '23P01' } },
      };
      prisma.bookingSeries.create.mockRejectedValue(exclusionViolation);

      await expect(
        service.createBookingSeries(ROOM.id, USER.id, SERIES_DTO),
      ).rejects.toThrow('Цей час уже заброньовано');
    });
  });

  describe('cancelBooking', () => {
    const EXISTING_BOOKING = {
      id: 'booking-1',
      title: 'Синхронізація команди',
      roomId: ROOM.id,
      startAt: new Date('2026-08-05T07:00:00.000Z'),
      endAt: new Date('2026-08-05T08:00:00.000Z'),
      userId: USER.id,
      cancelledAt: null as Date | null,
      user: USER,
    };

    it('rejects an unknown booking', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(
        service.cancelBooking('missing-booking', USER.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects cancelling someone else's booking", async () => {
      prisma.booking.findUnique.mockResolvedValue(EXISTING_BOOKING);
      await expect(
        service.cancelBooking(EXISTING_BOOKING.id, OTHER_USER.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });

    it('rejects cancelling an already-cancelled booking', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...EXISTING_BOOKING,
        cancelledAt: new Date('2026-08-04T09:00:00.000Z'),
      });
      await expect(
        service.cancelBooking(EXISTING_BOOKING.id, USER.id),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("cancels the owner's own booking", async () => {
      interface UpdateArgs {
        where: { id: string };
        data: { cancelledAt: Date };
      }
      let updateArgs: UpdateArgs | undefined;
      prisma.booking.findUnique.mockResolvedValue(EXISTING_BOOKING);
      prisma.booking.update.mockImplementation((args: UpdateArgs) => {
        updateArgs = args;
        return Promise.resolve({
          ...EXISTING_BOOKING,
          cancelledAt: new Date('2026-08-04T08:00:00.000Z'),
        });
      });

      const result = await service.cancelBooking(EXISTING_BOOKING.id, USER.id);

      expect(result.id).toBe(EXISTING_BOOKING.id);
      expect(updateArgs?.where).toEqual({ id: EXISTING_BOOKING.id });
      expect(updateArgs?.data.cancelledAt).toBeInstanceOf(Date);
    });

    it('purges any undelivered end-of-booking notification tied to the cancelled booking', async () => {
      prisma.booking.findUnique.mockResolvedValue(EXISTING_BOOKING);
      prisma.booking.update.mockResolvedValue({
        ...EXISTING_BOOKING,
        cancelledAt: new Date('2026-08-04T08:00:00.000Z'),
      });

      await service.cancelBooking(EXISTING_BOOKING.id, USER.id);

      expect(
        notificationsService.purgeUndeliveredNotificationsForCancellations,
      ).toHaveBeenCalledWith([
        {
          id: EXISTING_BOOKING.id,
          roomId: EXISTING_BOOKING.roomId,
          startAt: EXISTING_BOOKING.startAt,
        },
      ]);
    });
  });

  describe('cancelSeries', () => {
    const EXISTING_SERIES = {
      id: 'series-1',
      title: 'Щотижневий синк',
      userId: USER.id,
      cancelledAt: null as Date | null,
    };

    it('rejects an unknown series', async () => {
      prisma.bookingSeries.findUnique.mockResolvedValue(null);
      await expect(
        service.cancelSeries('missing-series', USER.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects cancelling someone else's series", async () => {
      prisma.bookingSeries.findUnique.mockResolvedValue(EXISTING_SERIES);
      await expect(
        service.cancelSeries(EXISTING_SERIES.id, OTHER_USER.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.bookingSeries.update).not.toHaveBeenCalled();
    });

    it('rejects cancelling an already-cancelled series', async () => {
      prisma.bookingSeries.findUnique.mockResolvedValue({
        ...EXISTING_SERIES,
        cancelledAt: new Date('2026-08-04T09:00:00.000Z'),
      });
      await expect(
        service.cancelSeries(EXISTING_SERIES.id, USER.id),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('cancels the series and every one of its still-active occurrences', async () => {
      prisma.bookingSeries.findUnique.mockResolvedValue(EXISTING_SERIES);
      prisma.bookingSeries.update.mockResolvedValue({
        ...EXISTING_SERIES,
        cancelledAt: new Date('2026-08-04T08:00:00.000Z'),
      });
      prisma.booking.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.cancelSeries(EXISTING_SERIES.id, USER.id);

      expect(result).toEqual({
        id: EXISTING_SERIES.id,
        cancelledOccurrenceCount: 2,
      });
      expect(prisma.bookingSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: EXISTING_SERIES.id } }),
      );
      expect(prisma.booking.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { seriesId: EXISTING_SERIES.id, cancelledAt: null },
        }),
      );
    });

    it('purges undelivered notifications for exactly the occurrences that were still active', async () => {
      const activeOccurrences = [
        {
          id: 'occ-1',
          roomId: ROOM.id,
          startAt: new Date('2026-08-05T07:00:00.000Z'),
        },
        {
          id: 'occ-2',
          roomId: ROOM.id,
          startAt: new Date('2026-08-12T07:00:00.000Z'),
        },
      ];
      prisma.bookingSeries.findUnique.mockResolvedValue(EXISTING_SERIES);
      prisma.bookingSeries.update.mockResolvedValue({
        ...EXISTING_SERIES,
        cancelledAt: new Date('2026-08-04T08:00:00.000Z'),
      });
      prisma.booking.findMany.mockResolvedValue(activeOccurrences);
      prisma.booking.updateMany.mockResolvedValue({
        count: activeOccurrences.length,
      });

      await service.cancelSeries(EXISTING_SERIES.id, USER.id);

      expect(
        notificationsService.purgeUndeliveredNotificationsForCancellations,
      ).toHaveBeenCalledWith(activeOccurrences);
    });
  });

  describe('listMyBookings', () => {
    it('queries only non-cancelled bookings ending after now for "upcoming", sorted soonest-first', async () => {
      const captured = captureFindManyArgs(prisma.booking.findMany, []);
      prisma.booking.count.mockResolvedValue(0);

      await service.listMyBookings(USER.id, 'upcoming', 1, 10);

      expect(captured.args?.where.userId).toBe(USER.id);
      expect(captured.args?.where.endAt?.gt).toBeInstanceOf(Date);
      expect(captured.args?.where.endAt?.lte).toBeUndefined();
      expect(captured.args?.where.cancelledAt).toBeNull();
      expect(captured.args?.orderBy).toEqual({ startAt: 'asc' });
    });

    it('queries only non-cancelled bookings that already ended for "past", sorted most-recent-first', async () => {
      const captured = captureFindManyArgs(prisma.booking.findMany, []);
      prisma.booking.count.mockResolvedValue(0);

      await service.listMyBookings(USER.id, 'past', 1, 10);

      expect(captured.args?.where.endAt?.lte).toBeInstanceOf(Date);
      expect(captured.args?.where.endAt?.gt).toBeUndefined();
      expect(captured.args?.where.cancelledAt).toBeNull();
      expect(captured.args?.orderBy).toEqual({ startAt: 'desc' });
    });

    it('queries only cancelled bookings for "cancelled", regardless of endAt, sorted most-recently-cancelled-first', async () => {
      const captured = captureFindManyArgs(prisma.booking.findMany, [
        {
          id: 'booking-3',
          title: 'Скасована зустріч',
          startAt: new Date('2026-08-10T07:00:00.000Z'),
          endAt: new Date('2026-08-10T08:00:00.000Z'),
          cancelledAt: new Date('2026-08-04T09:00:00.000Z'),
          seriesId: null,
          room: ROOM,
        },
      ]);
      prisma.booking.count.mockResolvedValue(1);

      const result = await service.listMyBookings(USER.id, 'cancelled', 1, 10);

      expect(captured.args?.where.userId).toBe(USER.id);
      expect(captured.args?.where.endAt).toBeUndefined();
      expect(captured.args?.where.cancelledAt).toEqual({ not: null });
      expect(captured.args?.orderBy).toEqual({ cancelledAt: 'desc' });
      expect(result.items[0].cancelledAt).toBe('2026-08-04T09:00:00.000Z');
    });

    it('paginates using page/pageSize and reports hasMore correctly', async () => {
      const captured = captureFindManyArgs(prisma.booking.findMany, []);
      prisma.booking.count.mockResolvedValue(25);

      const result = await service.listMyBookings(USER.id, 'upcoming', 2, 10);

      expect(captured.args?.skip).toBe(10);
      expect(captured.args?.take).toBe(10);
      expect(result).toMatchObject({
        page: 2,
        pageSize: 10,
        totalCount: 25,
        hasMore: true,
      });
    });

    it('reports hasMore as false on the last page', async () => {
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(15);

      const result = await service.listMyBookings(USER.id, 'upcoming', 2, 10);

      expect(result.hasMore).toBe(false);
    });
  });
});
