import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';

const ROOM = { id: 'room-1', name: 'Альфа', floor: 1, capacity: 4 };
const USER = { id: 'user-1', name: 'Марія Шевченко' };
const OTHER_USER = { id: 'user-2', name: 'Остап Гайдамака' };

// A fixed "now" (Tuesday, Kyiv summer time) so booking-time math is deterministic
// regardless of when the suite actually runs.
const FIXED_NOW = new Date('2026-08-04T08:00:00.000Z');

function createMockPrisma() {
  return {
    room: { findUnique: jest.fn() },
    booking: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('BookingsService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: BookingsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);
    prisma = createMockPrisma();
    prisma.room.findUnique.mockResolvedValue(ROOM);
    prisma.booking.findMany.mockResolvedValue([]);
    service = new BookingsService(prisma as unknown as PrismaService);
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

  it('accepts a booking that is merely adjacent to an existing one (BOOK-7)', async () => {
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

  describe('cancelBooking', () => {
    const EXISTING_BOOKING = {
      id: 'booking-1',
      title: 'Синхронізація команди',
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

    it("rejects cancelling someone else's booking (CANCEL-2)", async () => {
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

    it("cancels the owner's own booking (CANCEL-1)", async () => {
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
  });
});
