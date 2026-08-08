import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  getKyivDayBounds,
  isOnHalfHourBoundary,
  isWithinOfficeHours,
} from '../common/office-hours';
import { Prisma, type PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateBookingSeriesDto } from './dto/create-booking-series.dto';
import { hasOverlap } from './interval-overlap';
import { buildWeeklyOccurrences } from './weekly-occurrences';

const MIN_DURATION_MINUTES = 30;
const MAX_DURATION_MINUTES = 4 * 60;
const MS_PER_MINUTE = 60_000;
const OVERLAP_MESSAGE = 'Цей час уже заброньовано';
/** Postgres SQLSTATE for `exclusion_violation` -- stable across versions (SQL standard). */
const POSTGRES_EXCLUSION_VIOLATION_CODE = '23P01';

/** The subset of the Prisma client used both directly and inside `$transaction` callbacks. */
type PrismaTransactionClient = Pick<PrismaClient, 'booking' | 'bookingSeries'>;

export interface CreatedBooking {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  userId: string;
  userName: string;
}

export interface CreatedBookingSeries {
  id: string;
  title: string;
  occurrenceCount: number;
  occurrences: CreatedBooking[];
}

export interface CancelledSeries {
  id: string;
  cancelledOccurrenceCount: number;
}

export interface MyBooking {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  cancelledAt: string | null;
  seriesId: string | null;
  room: { id: string; name: string };
}

export interface MyBookingsPage {
  items: MyBooking[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
}

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async createBooking(
    roomId: string,
    userId: string,
    dto: CreateBookingDto,
  ): Promise<CreatedBooking> {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Кімнату не знайдено');
    }
    await this.assertEmailConfirmed(userId);

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    validateBookingTiming(startAt, endAt);
    await this.assertNoOverlap(this.prisma, roomId, startAt, endAt);

    // The check above is the fast path and handles the common case with one
    // query. It is not atomic with the insert, though: two requests can both
    // pass it before either commits. The `bookings_no_overlap` EXCLUDE
    // constraint is the actual race-condition guard -- it rejects the second
    // insert atomically at the database level, and we translate that
    // rejection into the same clean, user-facing conflict message.
    try {
      const booking = await this.prisma.booking.create({
        data: { roomId, userId, title: dto.title, startAt, endAt },
        include: { user: { select: { id: true, name: true } } },
      });
      return toCreatedBooking(booking);
    } catch (error) {
      if (isOverlapExclusionViolation(error)) {
        throw new ConflictException(OVERLAP_MESSAGE);
      }
      throw error;
    }
  }

  /**
   * Bonus: weekly recurring bookings (BONUS-3). Only the first occurrence's
   * timing is validated against the office-hours/boundary/duration rules --
   * every later occurrence is the same wall-clock time and duration 7*n days
   * later (see `buildWeeklyOccurrences`), so those rules hold structurally.
   * Each occurrence is still checked individually for overlap against
   * existing bookings, and the whole series is created in one transaction:
   * if any occurrence can't be booked, none of them are.
   */
  async createBookingSeries(
    roomId: string,
    userId: string,
    dto: CreateBookingSeriesDto,
  ): Promise<CreatedBookingSeries> {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Кімнату не знайдено');
    }
    await this.assertEmailConfirmed(userId);

    const firstStartAt = new Date(dto.startAt);
    const firstEndAt = new Date(dto.endAt);
    validateBookingTiming(firstStartAt, firstEndAt);

    const occurrences = buildWeeklyOccurrences(
      firstStartAt,
      firstEndAt,
      dto.occurrenceCount,
    );
    for (const occurrence of occurrences) {
      await this.assertNoOverlap(
        this.prisma,
        roomId,
        occurrence.startAt,
        occurrence.endAt,
      );
    }

    try {
      const { series, bookings } = await this.prisma.$transaction(
        async (tx) => {
          const series = await tx.bookingSeries.create({
            data: {
              roomId,
              userId,
              title: dto.title,
              startAt: firstStartAt,
              endAt: firstEndAt,
              occurrenceCount: dto.occurrenceCount,
            },
          });

          const bookings: Array<Parameters<typeof toCreatedBooking>[0]> = [];
          for (const [occurrenceIndex, occurrence] of occurrences.entries()) {
            bookings.push(
              await tx.booking.create({
                data: {
                  roomId,
                  userId,
                  title: dto.title,
                  startAt: occurrence.startAt,
                  endAt: occurrence.endAt,
                  seriesId: series.id,
                  occurrenceIndex,
                },
                include: { user: { select: { id: true, name: true } } },
              }),
            );
          }
          return { series, bookings };
        },
      );

      return {
        id: series.id,
        title: series.title,
        occurrenceCount: series.occurrenceCount,
        occurrences: bookings.map(toCreatedBooking),
      };
    } catch (error) {
      if (isOverlapExclusionViolation(error)) {
        throw new ConflictException(OVERLAP_MESSAGE);
      }
      throw error;
    }
  }

  async cancelBooking(
    bookingId: string,
    userId: string,
  ): Promise<CreatedBooking> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!booking) {
      throw new NotFoundException('Бронювання не знайдено');
    }
    if (booking.userId !== userId) {
      throw new ForbiddenException(
        'Ви можете скасувати лише власне бронювання',
      );
    }
    if (booking.cancelledAt) {
      throw new ConflictException('Бронювання вже скасовано');
    }

    const cancelled = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { cancelledAt: new Date() },
      include: { user: { select: { id: true, name: true } } },
    });

    return toCreatedBooking(cancelled);
  }

  /**
   * Cancels an entire series (BONUS-3): the series row itself plus every one
   * of its occurrences that isn't already cancelled. Already-cancelled
   * occurrences are left untouched (their own `cancelledAt` stays the
   * original cancellation time), matching the soft-cancellation history model.
   */
  async cancelSeries(
    seriesId: string,
    userId: string,
  ): Promise<CancelledSeries> {
    const series = await this.prisma.bookingSeries.findUnique({
      where: { id: seriesId },
    });
    if (!series) {
      throw new NotFoundException('Серію бронювань не знайдено');
    }
    if (series.userId !== userId) {
      throw new ForbiddenException(
        'Ви можете скасувати лише власну серію бронювань',
      );
    }
    if (series.cancelledAt) {
      throw new ConflictException('Серію вже скасовано');
    }

    const cancelledAt = new Date();
    const [, { count }] = await this.prisma.$transaction([
      this.prisma.bookingSeries.update({
        where: { id: seriesId },
        data: { cancelledAt },
      }),
      this.prisma.booking.updateMany({
        where: { seriesId, cancelledAt: null },
        data: { cancelledAt },
      }),
    ]);

    return { id: seriesId, cancelledOccurrenceCount: count };
  }

  /**
   * The fast-path overlap pre-check shared by single and recurring booking
   * creation. Not atomic with the insert -- the `bookings_no_overlap`
   * EXCLUDE constraint is the actual race-condition guard (see `createBooking`).
   */
  private async assertNoOverlap(
    client: PrismaTransactionClient,
    roomId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<void> {
    const { dayStartUtc, dayEndUtc } = getKyivDayBounds(startAt);
    const sameDayBookings = await client.booking.findMany({
      where: {
        roomId,
        cancelledAt: null,
        startAt: { gte: dayStartUtc },
        endAt: { lte: dayEndUtc },
      },
    });

    if (
      hasOverlap(
        { start: startAt, end: endAt },
        sameDayBookings.map((booking) => ({
          start: booking.startAt,
          end: booking.endAt,
        })),
      )
    ) {
      throw new ConflictException(OVERLAP_MESSAGE);
    }
  }

  /**
   * Bonus (BONUS-2): booking creation is blocked until the user's email is
   * confirmed (dev-mode confirmation link, see `AuthService`). Only creation
   * is gated -- viewing schedules, cancelling, and login all stay open.
   */
  private async assertEmailConfirmed(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailConfirmedAt: true },
    });
    if (!user?.emailConfirmedAt) {
      throw new ForbiddenException(
        'Підтвердьте email, щоб бронювати переговорні кімнати',
      );
    }
  }

  /**
   * A user's own bookings, including cancelled ones (shown with a badge in
   * "Мої бронювання" -- unlike the room grid, which hides cancelled slots).
   * "upcoming" vs "past" is based on `endAt`, so a booking currently in
   * progress still counts as upcoming until it actually ends.
   */
  async listMyBookings(
    userId: string,
    section: 'upcoming' | 'past',
    page: number,
    pageSize: number,
  ): Promise<MyBookingsPage> {
    const now = new Date();
    const where =
      section === 'upcoming'
        ? { userId, endAt: { gt: now } }
        : { userId, endAt: { lte: now } };
    const orderBy = {
      startAt: section === 'upcoming' ? ('asc' as const) : ('desc' as const),
    };

    const [items, totalCount] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { room: { select: { id: true, name: true } } },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      items: items.map(toMyBooking),
      page,
      pageSize,
      totalCount,
      hasMore: page * pageSize < totalCount,
    };
  }
}

/**
 * Whether `error` is the `bookings_no_overlap` EXCLUDE constraint rejecting
 * an insert. Prisma's driver-adapter errors don't get one of its own P-codes
 * for this, so the underlying Postgres SQLSTATE is nested in `error.meta`.
 */
function isOverlapExclusionViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  const meta = error.meta as
    { driverAdapterError?: { cause?: { originalCode?: string } } } | undefined;
  return (
    meta?.driverAdapterError?.cause?.originalCode ===
    POSTGRES_EXCLUSION_VIOLATION_CODE
  );
}

function toMyBooking(booking: {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  cancelledAt: Date | null;
  seriesId: string | null;
  room: { id: string; name: string };
}): MyBooking {
  return {
    id: booking.id,
    title: booking.title,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    cancelledAt: booking.cancelledAt ? booking.cancelledAt.toISOString() : null,
    seriesId: booking.seriesId,
    room: booking.room,
  };
}

/**
 * The rules shared by a single booking and the first occurrence of a series:
 * end after start, in the future, 30min-4h duration, on the half-hour grid,
 * within Kyiv office hours. Every later occurrence of a series inherits
 * these structurally (see `buildWeeklyOccurrences`), so this only needs to
 * run once per creation call.
 */
function validateBookingTiming(startAt: Date, endAt: Date): void {
  if (endAt.getTime() <= startAt.getTime()) {
    throw new BadRequestException(
      'Час завершення має бути пізніше часу початку',
    );
  }
  if (startAt.getTime() <= Date.now()) {
    throw new BadRequestException('Час бронювання має бути в майбутньому');
  }

  const durationMinutes = (endAt.getTime() - startAt.getTime()) / MS_PER_MINUTE;
  if (
    durationMinutes < MIN_DURATION_MINUTES ||
    durationMinutes > MAX_DURATION_MINUTES
  ) {
    throw new BadRequestException(
      'Тривалість бронювання має бути від 30 хвилин до 4 годин',
    );
  }

  if (!isOnHalfHourBoundary(startAt) || !isOnHalfHourBoundary(endAt)) {
    throw new BadRequestException('Час має бути кратним 30 хвилинам');
  }

  if (!isWithinOfficeHours(startAt, endAt)) {
    throw new BadRequestException(
      'Бронювання можливе лише в робочі години офісу: 09:00–19:00 за Києвом',
    );
  }
}

function toCreatedBooking(booking: {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  user: { id: string; name: string };
}): CreatedBooking {
  return {
    id: booking.id,
    title: booking.title,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    userId: booking.user.id,
    userName: booking.user.name,
  };
}
