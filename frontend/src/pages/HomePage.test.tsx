import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { Room, WeeklySchedule } from '../api/rooms';
import { HomePage } from './HomePage';

const { listRoomsMock, getRoomScheduleMock } = vi.hoisted(() => ({
  listRoomsMock: vi.fn(),
  getRoomScheduleMock: vi.fn(),
}));
vi.mock('../api/rooms', () => ({ listRooms: listRoomsMock, getRoomSchedule: getRoomScheduleMock }));

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../auth/useAuth', () => ({ useAuth: useAuthMock }));

function room(overrides: Partial<Room> = {}): Room {
  return { id: 'room-1', name: 'Альфа', floor: 1, capacity: 4, ...overrides };
}

function emptySchedule(overrides: Partial<WeeklySchedule> = {}): WeeklySchedule {
  return {
    room: room(),
    weekStartDate: '2026-08-10',
    officeTimezone: 'Europe/Kyiv',
    bookings: [],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ user: { id: 'user-1', name: 'Ганна Кузьменко', email: 'hanna@example.com', emailConfirmed: true } });
  getRoomScheduleMock.mockResolvedValue(emptySchedule());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HomePage', () => {
  it('shows a loading indicator before rooms arrive', () => {
    listRoomsMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Завантаження кімнат…');
  });

  it('renders the rooms table with floor and capacity once loaded', async () => {
    listRoomsMock.mockResolvedValue([room({ name: 'Гамма', floor: 2, capacity: 12 })]);
    renderPage();
    expect(await screen.findByText('Гамма')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('12 осіб')).toBeInTheDocument();
  });

  it('shows the empty state when there are no rooms', async () => {
    listRoomsMock.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('Кімнат поки немає.')).toBeInTheDocument();
  });

  it('shows an error message when the rooms request fails', async () => {
    listRoomsMock.mockRejectedValue(new ApiError('Сервер недоступний. Спробуйте пізніше.', 0));
    renderPage();
    expect(await screen.findByText('Сервер недоступний. Спробуйте пізніше.')).toBeInTheDocument();
  });

  it('shows "Вільна" for a room with no bookings covering the current moment', async () => {
    listRoomsMock.mockResolvedValue([room()]);
    getRoomScheduleMock.mockResolvedValue(emptySchedule());
    renderPage();
    expect(await screen.findByText('Вільна')).toBeInTheDocument();
  });

  it('shows "Зайнята" for a room with a booking covering right now', async () => {
    // Pin only Date, not timers -- RTL's findByText/waitFor polling still needs real setTimeout.
    // 13:00 Kyiv (EEST, UTC+3): safely inside 09:00-19:00 regardless of when the suite actually runs.
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = new Date('2026-08-10T10:00:00.000Z');
    vi.setSystemTime(now);

    const startAt = new Date(now.getTime() - 60_000).toISOString();
    const endAt = new Date(now.getTime() + 60_000).toISOString();
    listRoomsMock.mockResolvedValue([room()]);
    getRoomScheduleMock.mockResolvedValue(
      emptySchedule({
        bookings: [{ id: 'b1', title: 'Синхронізація команди', startAt, endAt, userId: 'user-1', userName: 'Ганна Кузьменко' }],
      }),
    );
    renderPage();
    expect(await screen.findByText('Зайнята')).toBeInTheDocument();
  });

  it('refetches with minCapacity when the filter is used, and "Скинути" clears it', async () => {
    listRoomsMock.mockResolvedValue([room()]);
    renderPage();
    await waitFor(() => expect(listRoomsMock).toHaveBeenCalledWith(undefined));

    fireEvent.change(screen.getByLabelText('Місткість від'), { target: { value: '8' } });
    await waitFor(() => expect(listRoomsMock).toHaveBeenCalledWith(8));

    fireEvent.click(screen.getByText('Скинути'));
    await waitFor(() => expect(listRoomsMock).toHaveBeenLastCalledWith(undefined));
  });

  it('shows a room-specific empty message when the capacity filter excludes everything', async () => {
    listRoomsMock.mockResolvedValue([]);
    renderPage();
    fireEvent.change(screen.getByLabelText('Місткість від'), { target: { value: '100' } });
    expect(await screen.findByText('Кімнат із такою місткістю немає.')).toBeInTheDocument();
  });

  it('shows the email-confirmation banner only when the user has not confirmed', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-1', name: 'X', email: 'x@example.com', emailConfirmed: false } });
    listRoomsMock.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/Підтвердьте email, щоб бронювати переговорні/)).toBeInTheDocument();
  });

  it('does not show the email-confirmation banner for a confirmed user', async () => {
    listRoomsMock.mockResolvedValue([]);
    renderPage();
    await screen.findByText('Кімнат поки немає.');
    expect(screen.queryByText(/Підтвердьте email, щоб бронювати переговорні/)).not.toBeInTheDocument();
  });

  it('links each room name to its schedule page', async () => {
    listRoomsMock.mockResolvedValue([room({ id: 'room-42', name: 'Омега' })]);
    renderPage();
    const link = await screen.findByText('Омега');
    expect(link.closest('a')).toHaveAttribute('href', '/rooms/room-42');
  });
});
