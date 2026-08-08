import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { take, toArray } from 'rxjs/operators';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationsService,
  type NotificationDto,
} from './notifications.service';

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const ROOM = { name: 'Альфа' };

function createMockPrisma() {
  return {
    booking: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

describe('NotificationsService (BONUS-5)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.notification.findMany.mockResolvedValue([]);
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      new ConfigService({}),
    );
  });

  describe('scanForEndOfBookingNotifications', () => {
    it("creates a notification when the room's next slot is already booked", async () => {
      const booking = {
        id: 'booking-1',
        userId: USER_ID,
        roomId: 'room-1',
        endAt: new Date(Date.now() + 5 * 60_000),
        title: 'Синк',
        room: ROOM,
      };
      prisma.booking.findMany.mockResolvedValue([booking]);
      prisma.booking.findFirst.mockResolvedValue({ id: 'next-booking' });
      interface CreateArgs {
        data: { bookingId: string; userId: string; notifyAt: Date };
      }
      let createArgs: CreateArgs | undefined;
      prisma.notification.create.mockImplementation((args: CreateArgs) => {
        createArgs = args;
        return Promise.resolve({
          id: 'notif-1',
          bookingId: booking.id,
          createdAt: new Date(),
        });
      });

      await service.scanForEndOfBookingNotifications();

      expect(createArgs?.data.bookingId).toBe(booking.id);
      expect(createArgs?.data.userId).toBe(booking.userId);
      expect(createArgs?.data.notifyAt).toBeInstanceOf(Date);
    });

    it("does not create a notification when the room's next slot is free", async () => {
      const booking = {
        id: 'booking-1',
        userId: USER_ID,
        roomId: 'room-1',
        endAt: new Date(Date.now() + 5 * 60_000),
        title: 'Синк',
        room: ROOM,
      };
      prisma.booking.findMany.mockResolvedValue([booking]);
      prisma.booking.findFirst.mockResolvedValue(null);

      await service.scanForEndOfBookingNotifications();

      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('swallows a unique-constraint race from a concurrent scan tick instead of throwing', async () => {
      const booking = {
        id: 'booking-1',
        userId: USER_ID,
        roomId: 'room-1',
        endAt: new Date(Date.now() + 5 * 60_000),
        title: 'Синк',
        room: ROOM,
      };
      prisma.booking.findMany.mockResolvedValue([booking]);
      prisma.booking.findFirst.mockResolvedValue({ id: 'next-booking' });
      const uniqueViolation = Object.create(
        Prisma.PrismaClientKnownRequestError.prototype,
      ) as Record<string, unknown>;
      uniqueViolation.message = 'Unique constraint failed';
      uniqueViolation.code = 'P2002';
      prisma.notification.create.mockRejectedValue(uniqueViolation);

      await expect(
        service.scanForEndOfBookingNotifications(),
      ).resolves.toBeUndefined();
    });

    it('re-throws unrelated database errors from create', async () => {
      const booking = {
        id: 'booking-1',
        userId: USER_ID,
        roomId: 'room-1',
        endAt: new Date(Date.now() + 5 * 60_000),
        title: 'Синк',
        room: ROOM,
      };
      prisma.booking.findMany.mockResolvedValue([booking]);
      prisma.booking.findFirst.mockResolvedValue({ id: 'next-booking' });
      prisma.notification.create.mockRejectedValue(
        new Error('connection lost'),
      );

      await expect(service.scanForEndOfBookingNotifications()).rejects.toThrow(
        'connection lost',
      );
    });

    it('uses NOTIFY_BEFORE_MINUTES from config, falling back to 10 when unset', async () => {
      const withCustomMinutes = new NotificationsService(
        prisma as unknown as PrismaService,
        new ConfigService({ NOTIFY_BEFORE_MINUTES: '30' }),
      );
      let capturedWhere: { endAt: { lte: Date } } | undefined;
      prisma.booking.findMany.mockImplementation(
        ({ where }: { where: { endAt: { lte: Date } } }) => {
          capturedWhere = where;
          return Promise.resolve([]);
        },
      );

      const before = Date.now();
      await withCustomMinutes.scanForEndOfBookingNotifications();

      const windowMinutes =
        (capturedWhere!.endAt.lte.getTime() - before) / 60_000;
      expect(windowMinutes).toBeGreaterThan(29);
      expect(windowMinutes).toBeLessThanOrEqual(30);
    });
  });

  describe('getRecentForUser', () => {
    it('maps persisted notifications to the DTO shape', async () => {
      prisma.notification.findMany.mockResolvedValue([
        {
          id: 'notif-1',
          bookingId: 'booking-1',
          createdAt: new Date('2026-08-04T07:50:00.000Z'),
          booking: {
            title: 'Синк',
            endAt: new Date('2026-08-04T08:00:00.000Z'),
            room: { name: 'Альфа' },
          },
        },
      ]);

      const result = await service.getRecentForUser(USER_ID);

      expect(result).toEqual([
        {
          id: 'notif-1',
          bookingId: 'booking-1',
          bookingTitle: 'Синк',
          roomName: 'Альфа',
          endAt: '2026-08-04T08:00:00.000Z',
          createdAt: '2026-08-04T07:50:00.000Z',
        },
      ]);
    });
  });

  describe('streamForUser', () => {
    it('replays undelivered notifications as a catch-up burst on connect, and marks them delivered', async () => {
      prisma.notification.findMany.mockResolvedValue([
        {
          id: 'notif-1',
          bookingId: 'booking-1',
          createdAt: new Date('2026-08-04T07:50:00.000Z'),
          booking: {
            title: 'Синк',
            endAt: new Date('2026-08-04T08:00:00.000Z'),
            room: { name: 'Альфа' },
          },
        },
      ]);
      interface UpdateManyArgs {
        where: { id: { in: string[] } };
        data: { deliveredAt: Date };
      }
      let updateManyArgs: UpdateManyArgs | undefined;
      prisma.notification.updateMany.mockImplementation(
        (args: UpdateManyArgs) => {
          updateManyArgs = args;
          return Promise.resolve({ count: 1 });
        },
      );

      const events = await firstValueFrom(
        service.streamForUser(USER_ID).pipe(take(1), toArray()),
      );

      expect(events).toHaveLength(1);
      expect(events[0].data).toMatchObject({
        id: 'notif-1',
        bookingTitle: 'Синк',
      });
      expect(updateManyArgs?.where).toEqual({ id: { in: ['notif-1'] } });
      expect(updateManyArgs?.data.deliveredAt).toBeInstanceOf(Date);
    });

    it('does not touch the DB for catch-up when there is no undelivered backlog', async () => {
      prisma.notification.findMany.mockResolvedValue([]);

      const subscription = service.streamForUser(USER_ID).subscribe();
      await Promise.resolve();
      await Promise.resolve();

      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
      subscription.unsubscribe();
    });

    it('delivers a freshly-scanned notification to a live subscriber for that user, and marks it delivered', async () => {
      const booking = {
        id: 'booking-1',
        userId: USER_ID,
        roomId: 'room-1',
        endAt: new Date(Date.now() + 5 * 60_000),
        title: 'Синк',
        room: ROOM,
      };
      prisma.booking.findMany.mockResolvedValue([booking]);
      prisma.booking.findFirst.mockResolvedValue({ id: 'next-booking' });
      prisma.notification.create.mockResolvedValue({
        id: 'notif-1',
        bookingId: booking.id,
        createdAt: new Date(),
      });
      interface UpdateArgs {
        where: { id: string };
        data: { deliveredAt: Date };
      }
      let updateArgs: UpdateArgs | undefined;
      prisma.notification.update.mockImplementation((args: UpdateArgs) => {
        updateArgs = args;
        return Promise.resolve({});
      });

      const received: NotificationDto[] = [];
      const subscription = service
        .streamForUser(USER_ID)
        .subscribe((event) => received.push(event.data as NotificationDto));
      // Let the (empty) catch-up burst resolve so `concat` moves on to attach
      // the live listener before the scan below fires its event.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      await service.scanForEndOfBookingNotifications();

      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        id: 'notif-1',
        bookingTitle: 'Синк',
      });
      expect(updateArgs?.where).toEqual({ id: 'notif-1' });
      expect(updateArgs?.data.deliveredAt).toBeInstanceOf(Date);
      subscription.unsubscribe();
    });

    it("does not deliver another user's live notification", async () => {
      const booking = {
        id: 'booking-1',
        userId: OTHER_USER_ID,
        roomId: 'room-1',
        endAt: new Date(Date.now() + 5 * 60_000),
        title: 'Синк',
        room: ROOM,
      };
      prisma.booking.findMany.mockResolvedValue([booking]);
      prisma.booking.findFirst.mockResolvedValue({ id: 'next-booking' });
      prisma.notification.create.mockResolvedValue({
        id: 'notif-1',
        bookingId: booking.id,
        createdAt: new Date(),
      });

      const received: NotificationDto[] = [];
      const subscription = service
        .streamForUser(USER_ID)
        .subscribe((event) => received.push(event.data as NotificationDto));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      await service.scanForEndOfBookingNotifications();

      expect(received).toHaveLength(0);
      subscription.unsubscribe();
    });
  });

  describe('purgeUndeliveredNotificationsForCancellations', () => {
    it('is a no-op for an empty list', async () => {
      await service.purgeUndeliveredNotificationsForCancellations([]);
      expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
    });

    it('builds a single deleteMany covering the cancelled booking and its adjacent-slot notifications', async () => {
      const startAt = new Date('2026-08-05T08:00:00.000Z');
      await service.purgeUndeliveredNotificationsForCancellations([
        { id: 'booking-1', roomId: 'room-1', startAt },
      ]);

      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: {
          deliveredAt: null,
          OR: [
            { bookingId: 'booking-1' },
            {
              booking: { roomId: 'room-1', endAt: startAt, cancelledAt: null },
            },
          ],
        },
      });
    });
  });
});
