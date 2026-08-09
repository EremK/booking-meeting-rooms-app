import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from './rooms.service';

function createMockPrisma() {
  return {
    room: { findMany: jest.fn() },
  };
}

describe('RoomsService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: RoomsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.room.findMany.mockResolvedValue([]);
    service = new RoomsService(prisma as unknown as PrismaService);
  });

  describe('listRooms (capacity filter)', () => {
    it('lists all rooms, ordered by floor then name, when no filter is given', async () => {
      await service.listRooms();

      expect(prisma.room.findMany).toHaveBeenCalledWith({
        where: undefined,
        select: { id: true, name: true, floor: true, capacity: true },
        orderBy: [{ floor: 'asc' }, { name: 'asc' }],
      });
    });

    it('filters to rooms with at least the given capacity (inclusive)', async () => {
      await service.listRooms(6);

      expect(prisma.room.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { capacity: { gte: 6 } },
        }),
      );
    });

    it('treats an undefined minCapacity the same as no filter', async () => {
      await service.listRooms(undefined);

      expect(prisma.room.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });
  });
});
