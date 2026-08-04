import { Injectable, NotFoundException } from '@nestjs/common';
import { getKyivWeekBounds, OFFICE_TIMEZONE } from '../common/office-hours';
import { PrismaService } from '../prisma/prisma.service';

export interface RoomSummary {
  id: string;
  name: string;
  floor: number;
  capacity: number;
}

export interface ScheduleBooking {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  userId: string;
  userName: string;
}

export interface WeeklySchedule {
  room: RoomSummary;
  weekStartDate: string;
  officeTimezone: string;
  bookings: ScheduleBooking[];
}

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  listRooms(): Promise<RoomSummary[]> {
    return this.prisma.room.findMany({
      select: { id: true, name: true, floor: true, capacity: true },
      orderBy: [{ floor: 'asc' }, { name: 'asc' }],
    });
  }

  async getWeeklySchedule(
    roomId: string,
    date?: string,
  ): Promise<WeeklySchedule> {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Кімнату не знайдено');
    }

    const { weekStartDate, weekStartUtc, weekEndUtc } = getKyivWeekBounds(date);

    const bookings = await this.prisma.booking.findMany({
      where: {
        roomId,
        cancelledAt: null,
        startAt: { lt: weekEndUtc },
        endAt: { gt: weekStartUtc },
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { startAt: 'asc' },
    });

    return {
      room: {
        id: room.id,
        name: room.name,
        floor: room.floor,
        capacity: room.capacity,
      },
      weekStartDate,
      officeTimezone: OFFICE_TIMEZONE,
      bookings: bookings.map((booking) => ({
        id: booking.id,
        title: booking.title,
        startAt: booking.startAt.toISOString(),
        endAt: booking.endAt.toISOString(),
        userId: booking.user.id,
        userName: booking.user.name,
      })),
    };
  }
}
