import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { DateTime } from 'luxon';
import { kyivWallTimeToUtc, OFFICE_TIMEZONE } from '../src/common/office-hours';
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const BCRYPT_SALT_ROUNDS = 10;
// Test credentials, documented in README: same password for both seeded accounts.
const TEST_USER_PASSWORD = 'password123';

const ROOMS = [
  { name: 'Альфа', floor: 1, capacity: 4 },
  { name: 'Бета', floor: 2, capacity: 6 },
  { name: 'Гамма', floor: 2, capacity: 12 },
  { name: 'Дельта', floor: 3, capacity: 8 },
  { name: 'Епсилон', floor: 3, capacity: 20 },
  { name: 'Омега', floor: 4, capacity: 10 },
];

const USERS = [
  { name: 'Ганна Кузьменко', email: 'hanna.kuzmenko@example.com' },
  { name: 'Остап Гайдамака', email: 'ostap.haidamaka@example.com' },
];

/** Kyiv wall-clock time N days from "today" (at seed run time), so demo data stays realistic. */
function kyivDaysFromNowAt(dayOffset: number, hour: number, minute: number): Date {
  const today = DateTime.now().setZone(OFFICE_TIMEZONE).plus({ days: dayOffset });
  return kyivWallTimeToUtc({ year: today.year, month: today.month, day: today.day, hour, minute });
}

interface DemoBooking {
  roomName: string;
  userEmail: string;
  title: string;
  start: Date;
  end: Date;
}

function buildDemoBookings(): DemoBooking[] {
  return [
    {
      roomName: 'Дельта',
      userEmail: 'hanna.kuzmenko@example.com',
      title: 'Огляд якості коду',
      start: kyivDaysFromNowAt(-10, 10, 0),
      end: kyivDaysFromNowAt(-10, 11, 0),
    },
    {
      roomName: 'Епсилон',
      userEmail: 'ostap.haidamaka@example.com',
      title: 'Зустріч з інвестором',
      start: kyivDaysFromNowAt(-8, 14, 0),
      end: kyivDaysFromNowAt(-8, 15, 0),
    },
    {
      roomName: 'Альфа',
      userEmail: 'hanna.kuzmenko@example.com',
      title: 'Навчання нового співробітника',
      start: kyivDaysFromNowAt(-6, 9, 30),
      end: kyivDaysFromNowAt(-6, 11, 0),
    },
    {
      roomName: 'Омега',
      userEmail: 'ostap.haidamaka@example.com',
      title: 'Підбиття підсумків місяця',
      start: kyivDaysFromNowAt(-4, 16, 0),
      end: kyivDaysFromNowAt(-4, 17, 0),
    },
    {
      roomName: 'Гамма',
      userEmail: 'hanna.kuzmenko@example.com',
      title: 'Ретроспектива спринту',
      start: kyivDaysFromNowAt(-3, 10, 0),
      end: kyivDaysFromNowAt(-3, 11, 0),
    },
    {
      roomName: 'Бета',
      userEmail: 'ostap.haidamaka@example.com',
      title: 'Дзвінок з клієнтом',
      start: kyivDaysFromNowAt(-1, 14, 0),
      end: kyivDaysFromNowAt(-1, 14, 30),
    },
    {
      roomName: 'Гамма',
      userEmail: 'hanna.kuzmenko@example.com',
      title: 'Щотижневий синк команди',
      start: kyivDaysFromNowAt(0, 16, 0),
      end: kyivDaysFromNowAt(0, 16, 30),
    },
    {
      roomName: 'Альфа',
      userEmail: 'hanna.kuzmenko@example.com',
      title: 'Синхронізація команди',
      start: kyivDaysFromNowAt(1, 9, 30),
      end: kyivDaysFromNowAt(1, 10, 0),
    },
    {
      roomName: 'Альфа',
      userEmail: 'ostap.haidamaka@example.com',
      title: 'Співбесіда з кандидатом',
      start: kyivDaysFromNowAt(1, 10, 0),
      end: kyivDaysFromNowAt(1, 11, 0),
    },
    {
      roomName: 'Епсилон',
      userEmail: 'hanna.kuzmenko@example.com',
      title: 'Демо продукту для інвесторів',
      start: kyivDaysFromNowAt(2, 13, 0),
      end: kyivDaysFromNowAt(2, 14, 30),
    },
    {
      roomName: 'Бета',
      userEmail: 'ostap.haidamaka@example.com',
      title: 'Огляд бюджету відділу',
      start: kyivDaysFromNowAt(3, 11, 0),
      end: kyivDaysFromNowAt(3, 12, 0),
    },
    {
      roomName: 'Дельта',
      userEmail: 'hanna.kuzmenko@example.com',
      title: 'Співбесіда: Product Manager',
      start: kyivDaysFromNowAt(4, 10, 0),
      end: kyivDaysFromNowAt(4, 11, 0),
    },
    {
      roomName: 'Омега',
      userEmail: 'ostap.haidamaka@example.com',
      title: 'Планування спринту',
      start: kyivDaysFromNowAt(5, 11, 0),
      end: kyivDaysFromNowAt(5, 12, 0),
    },
    {
      roomName: 'Дельта',
      userEmail: 'hanna.kuzmenko@example.com',
      title: 'Знайомство з новим клієнтом',
      start: kyivDaysFromNowAt(6, 15, 0),
      end: kyivDaysFromNowAt(6, 16, 0),
    },
    {
      roomName: 'Гамма',
      userEmail: 'ostap.haidamaka@example.com',
      title: 'Ретро по кварталу',
      start: kyivDaysFromNowAt(7, 10, 0),
      end: kyivDaysFromNowAt(7, 11, 0),
    },
    {
      roomName: 'Епсилон',
      userEmail: 'hanna.kuzmenko@example.com',
      title: 'Технічний огляд архітектури',
      start: kyivDaysFromNowAt(8, 13, 0),
      end: kyivDaysFromNowAt(8, 14, 0),
    },
    {
      roomName: 'Альфа',
      userEmail: 'ostap.haidamaka@example.com',
      title: 'Нарада з постачальником',
      start: kyivDaysFromNowAt(9, 9, 0),
      end: kyivDaysFromNowAt(9, 10, 0),
    },
    {
      roomName: 'Бета',
      userEmail: 'hanna.kuzmenko@example.com',
      title: 'Планування маркетингової кампанії',
      start: kyivDaysFromNowAt(10, 14, 0),
      end: kyivDaysFromNowAt(10, 15, 0),
    },
    {
      roomName: 'Гамма',
      userEmail: 'ostap.haidamaka@example.com',
      title: 'Особиста зустріч з керівником',
      start: kyivDaysFromNowAt(11, 16, 30),
      end: kyivDaysFromNowAt(11, 17, 0),
    },
    {
      roomName: 'Омега',
      userEmail: 'hanna.kuzmenko@example.com',
      title: 'Демонстрація нового функціоналу',
      start: kyivDaysFromNowAt(12, 11, 0),
      end: kyivDaysFromNowAt(12, 12, 30),
    },
    {
      roomName: 'Дельта',
      userEmail: 'ostap.haidamaka@example.com',
      title: 'Огляд контракту з партнером',
      start: kyivDaysFromNowAt(13, 9, 30),
      end: kyivDaysFromNowAt(13, 10, 30),
    },
  ];
}

async function main(): Promise<void> {
  // Seed is idempotent: wipe demo data (FK-safe order) before recreating it.
  await prisma.notification.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.bookingSeries.deleteMany();
  await prisma.room.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash(TEST_USER_PASSWORD, BCRYPT_SALT_ROUNDS);

  const createdUsers = await Promise.all(
    USERS.map((user) =>
      prisma.user.create({
        data: {
          name: user.name,
          email: user.email,
          passwordHash,
          emailConfirmedAt: new Date(),
        },
      }),
    ),
  );
  const userIdByEmail = new Map(createdUsers.map((user) => [user.email, user.id]));

  const createdRooms = await Promise.all(ROOMS.map((room) => prisma.room.create({ data: room })));
  const roomIdByName = new Map(createdRooms.map((room) => [room.name, room.id]));

  for (const booking of buildDemoBookings()) {
    const roomId = roomIdByName.get(booking.roomName);
    const userId = userIdByEmail.get(booking.userEmail);
    if (!roomId || !userId) {
      throw new Error(`Seed data references unknown room/user: ${booking.roomName} / ${booking.userEmail}`);
    }
    await prisma.booking.create({
      data: {
        roomId,
        userId,
        title: booking.title,
        startAt: booking.start,
        endAt: booking.end,
      },
    });
  }

  console.log(`Seeded ${createdUsers.length} users, ${createdRooms.length} rooms, ${buildDemoBookings().length} bookings.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
