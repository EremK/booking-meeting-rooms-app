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
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { hasOverlap } from './interval-overlap';

const MIN_DURATION_MINUTES = 30;
const MAX_DURATION_MINUTES = 4 * 60;
const MS_PER_MINUTE = 60_000;

export interface CreatedBooking {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  userId: string;
  userName: string;
}

export interface MyBooking {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  cancelledAt: string | null;
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

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    if (endAt.getTime() <= startAt.getTime()) {
      throw new BadRequestException(
        'Час завершення має бути пізніше часу початку',
      );
    }
    if (startAt.getTime() <= Date.now()) {
      throw new BadRequestException('Час бронювання має бути в майбутньому');
    }

    const durationMinutes =
      (endAt.getTime() - startAt.getTime()) / MS_PER_MINUTE;
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

    const { dayStartUtc, dayEndUtc } = getKyivDayBounds(startAt);
    const sameDayBookings = await this.prisma.booking.findMany({
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
      throw new ConflictException('Цей час уже заброньовано');
    }

    const booking = await this.prisma.booking.create({
      data: { roomId, userId, title: dto.title, startAt, endAt },
      include: { user: { select: { id: true, name: true } } },
    });

    return toCreatedBooking(booking);
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

function toMyBooking(booking: {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  cancelledAt: Date | null;
  room: { id: string; name: string };
}): MyBooking {
  return {
    id: booking.id,
    title: booking.title,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    cancelledAt: booking.cancelledAt ? booking.cancelledAt.toISOString() : null,
    room: booking.room,
  };
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
