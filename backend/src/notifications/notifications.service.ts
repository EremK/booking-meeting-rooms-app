import { EventEmitter } from 'events';
import { Injectable, type MessageEvent } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import {
  concat,
  concatMap,
  filter,
  from,
  fromEvent,
  map,
  Observable,
  tap,
} from 'rxjs';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_NOTIFY_BEFORE_MINUTES = 10;
const SCAN_INTERVAL_MS = 15_000;
const RECENT_NOTIFICATIONS_LIMIT = 20;
const PRISMA_UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

export interface NotificationDto {
  id: string;
  bookingId: string;
  bookingTitle: string;
  roomName: string;
  endAt: string;
  createdAt: string;
}

interface LiveNotificationEvent {
  userId: string;
  payload: NotificationDto;
}

type BookingWithRoom = {
  title: string;
  endAt: Date;
  room: { name: string };
};

/**
 * Bonus: end-of-booking notifications. A scheduled scan finds
 * bookings entering their "N minutes before end" window whose room's next
 * slot is already booked, persists exactly one `Notification` row per
 * booking (the DB's `bookingId` unique constraint is the actual guarantee),
 * and pushes it live over SSE to any connected client for that user.
 * Notifications created while the user is disconnected stay undelivered
 * (`deliveredAt: null`) and are replayed as a catch-up burst on the next
 * SSE (re)connect.
 */
@Injectable()
export class NotificationsService {
  /** In-process pub/sub for live SSE push -- single backend instance, no external broker needed. */
  private readonly emitter = new EventEmitter();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.emitter.setMaxListeners(0);
  }

  @Interval(SCAN_INTERVAL_MS)
  async scanForEndOfBookingNotifications(): Promise<void> {
    const notifyBeforeMinutes = this.getNotifyBeforeMinutes();
    const now = new Date();
    const windowEnd = new Date(now.getTime() + notifyBeforeMinutes * 60_000);

    const candidates = await this.prisma.booking.findMany({
      where: {
        cancelledAt: null,
        endAt: { gt: now, lte: windowEnd },
        notification: { is: null },
      },
      select: {
        id: true,
        userId: true,
        roomId: true,
        endAt: true,
        title: true,
        room: { select: { name: true } },
      },
    });

    for (const booking of candidates) {
      const nextSlotBooking = await this.prisma.booking.findFirst({
        where: {
          roomId: booking.roomId,
          startAt: booking.endAt,
          cancelledAt: null,
        },
        select: { id: true },
      });
      if (!nextSlotBooking) {
        continue;
      }

      try {
        const created = await this.prisma.notification.create({
          data: {
            bookingId: booking.id,
            userId: booking.userId,
            notifyAt: new Date(
              booking.endAt.getTime() - notifyBeforeMinutes * 60_000,
            ),
          },
        });
        this.pushLive(booking.userId, toNotificationDto(created, booking));
      } catch (error) {
        if (!isUniqueConstraintViolation(error)) {
          throw error;
        }
        // Another tick already created it -- exactly-once is the DB's job.
      }
    }
  }

  async getRecentForUser(userId: string): Promise<NotificationDto[]> {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_NOTIFICATIONS_LIMIT,
      include: {
        booking: {
          select: {
            title: true,
            endAt: true,
            room: { select: { name: true } },
          },
        },
      },
    });
    return notifications.map((notification) =>
      toNotificationDto(notification, notification.booking),
    );
  }

  /** SSE stream for one user: undelivered backlog first, then live pushes. */
  streamForUser(userId: string): Observable<MessageEvent> {
    // `from(promise)` would emit the resolved array as a single value; flatten
    // it into one emission per notification with `concatMap(... from(array))`.
    const catchUp$ = from(this.catchUpUndelivered(userId)).pipe(
      concatMap((notifications) => from(notifications)),
    );
    const live$ = fromEvent<LiveNotificationEvent>(
      this.emitter,
      'notification',
    ).pipe(
      filter((event) => event.userId === userId),
      map((event) => event.payload),
      tap((payload) => void this.markDelivered(payload.id)),
    );
    return concat(catchUp$, live$).pipe(map((payload) => ({ data: payload })));
  }

  /**
   * Bonus: cancelling either the notified booking or the adjacent
   * one that made its slot "next-slot-booked" must stop an undelivered
   * notification from arriving. Delivered notifications are left as history.
   * Batched (rather than one call per booking) so series cancellation --
   * which can cancel dozens of occurrences at once -- issues a single query.
   */
  async purgeUndeliveredNotificationsForCancellations(
    cancelledBookings: Array<{ id: string; roomId: string; startAt: Date }>,
  ): Promise<void> {
    if (cancelledBookings.length === 0) {
      return;
    }
    await this.prisma.notification.deleteMany({
      where: {
        deliveredAt: null,
        OR: cancelledBookings.flatMap((booking) => [
          { bookingId: booking.id },
          {
            booking: {
              roomId: booking.roomId,
              endAt: booking.startAt,
              cancelledAt: null,
            },
          },
        ]),
      },
    });
  }

  private async catchUpUndelivered(userId: string): Promise<NotificationDto[]> {
    const pending = await this.prisma.notification.findMany({
      where: { userId, deliveredAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        booking: {
          select: {
            title: true,
            endAt: true,
            room: { select: { name: true } },
          },
        },
      },
    });
    if (pending.length > 0) {
      await this.prisma.notification.updateMany({
        where: { id: { in: pending.map((notification) => notification.id) } },
        data: { deliveredAt: new Date() },
      });
    }
    return pending.map((notification) =>
      toNotificationDto(notification, notification.booking),
    );
  }

  private async markDelivered(notificationId: string): Promise<void> {
    await this.prisma.notification
      .update({
        where: { id: notificationId },
        data: { deliveredAt: new Date() },
      })
      .catch(() => undefined);
  }

  private pushLive(userId: string, payload: NotificationDto): void {
    this.emitter.emit('notification', {
      userId,
      payload,
    } satisfies LiveNotificationEvent);
  }

  private getNotifyBeforeMinutes(): number {
    const parsed = Number(
      this.configService.get<string>('NOTIFY_BEFORE_MINUTES'),
    );
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_NOTIFY_BEFORE_MINUTES;
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === PRISMA_UNIQUE_CONSTRAINT_ERROR_CODE
  );
}

function toNotificationDto(
  notification: { id: string; bookingId: string; createdAt: Date },
  booking: BookingWithRoom,
): NotificationDto {
  return {
    id: notification.id,
    bookingId: notification.bookingId,
    bookingTitle: booking.title,
    roomName: booking.room.name,
    endAt: booking.endAt.toISOString(),
    createdAt: notification.createdAt.toISOString(),
  };
}
