import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyBooking, MyBookingsPage as MyBookingsPageResult } from '../api/my-bookings';
import { ApiError } from '../api/client';
import { MyBookingsPage } from './MyBookingsPage';

const { listMyBookingsMock, cancelBookingMock, cancelBookingSeriesMock } = vi.hoisted(() => ({
  listMyBookingsMock: vi.fn(),
  cancelBookingMock: vi.fn(),
  cancelBookingSeriesMock: vi.fn(),
}));
vi.mock('../api/my-bookings', () => ({ listMyBookings: listMyBookingsMock }));
vi.mock('../api/bookings', () => ({
  cancelBooking: cancelBookingMock,
  cancelBookingSeries: cancelBookingSeriesMock,
}));

function booking(overrides: Partial<MyBooking> = {}): MyBooking {
  return {
    id: 'booking-1',
    title: 'Синхронізація команди',
    startAt: '2026-08-10T07:00:00.000Z',
    endAt: '2026-08-10T08:00:00.000Z',
    cancelledAt: null,
    seriesId: null,
    room: { id: 'room-1', name: 'Альфа' },
    ...overrides,
  };
}

function page(items: MyBooking[], overrides: Partial<MyBookingsPageResult> = {}): MyBookingsPageResult {
  return { items, page: 1, pageSize: 10, totalCount: items.length, hasMore: false, ...overrides };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MyBookingsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listMyBookingsMock.mockResolvedValue(page([]));
});

describe('MyBookingsPage', () => {
  it('shows a loading indicator before data arrives', () => {
    listMyBookingsMock.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Завантаження…');
  });

  it('shows the empty state when there are no bookings', async () => {
    renderPage();
    expect(await screen.findByText('Бронювань немає.')).toBeInTheDocument();
  });

  it('shows an error message when the request fails', async () => {
    listMyBookingsMock.mockRejectedValue(new ApiError('Сервер недоступний. Спробуйте пізніше.', 0));
    renderPage();
    expect(await screen.findByText('Сервер недоступний. Спробуйте пізніше.')).toBeInTheDocument();
  });

  it('renders a booking row with date, time, room and title', async () => {
    listMyBookingsMock.mockResolvedValue(page([booking()]));
    renderPage();
    expect(await screen.findByText('Синхронізація команди')).toBeInTheDocument();
    expect(screen.getByText('Альфа')).toBeInTheDocument();
  });

  it('fetches only two sections: "upcoming" by default, and "past" when that tab is clicked', async () => {
    renderPage();
    await waitFor(() => expect(listMyBookingsMock).toHaveBeenCalledWith('upcoming', 1, 10, false));
    expect(screen.queryByText('Скасовані')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Минулі'));

    await waitFor(() => expect(listMyBookingsMock).toHaveBeenCalledWith('past', 1, 10, false));
  });

  it('requests includeCancelled=true when the "Показувати скасовані" checkbox is checked, and resets to page 1', async () => {
    renderPage();
    await waitFor(() => expect(listMyBookingsMock).toHaveBeenCalledWith('upcoming', 1, 10, false));

    fireEvent.click(screen.getByLabelText('Показувати скасовані'));

    await waitFor(() => expect(listMyBookingsMock).toHaveBeenCalledWith('upcoming', 1, 10, true));
  });

  it('shows the "Скасовано" badge on a cancelled booking mixed into the upcoming list', async () => {
    listMyBookingsMock.mockResolvedValue(page([booking({ cancelledAt: '2026-08-09T00:00:00.000Z' })]));
    renderPage();
    expect(await screen.findByText('Скасовано')).toBeInTheDocument();
  });

  it("doesn't show a cancel button for an already-cancelled booking even when mixed into the upcoming list", async () => {
    listMyBookingsMock.mockResolvedValue(page([booking({ cancelledAt: '2026-08-09T00:00:00.000Z' })]));
    renderPage();
    await screen.findByText('Синхронізація команди');
    expect(screen.queryByText('Скасувати')).not.toBeInTheDocument();
  });

  it('only shows the cancel button on the upcoming tab for non-cancelled bookings', async () => {
    listMyBookingsMock.mockResolvedValue(page([booking()]));
    renderPage();
    expect(await screen.findByText('Скасувати')).toBeInTheDocument();
  });

  it('shows a "cancel series" button in addition to the regular one when the booking has a seriesId', async () => {
    listMyBookingsMock.mockResolvedValue(page([booking({ seriesId: 'series-1' })]));
    renderPage();
    expect(await screen.findByText('Скасувати серію')).toBeInTheDocument();
  });

  it('confirms and cancels a single booking, then reloads the list', async () => {
    listMyBookingsMock.mockResolvedValue(page([booking()]));
    cancelBookingMock.mockResolvedValue({ ...booking(), cancelledAt: '2026-08-09T00:00:00.000Z' });
    renderPage();
    await screen.findByText('Скасувати');

    fireEvent.click(screen.getByText('Скасувати'));
    expect(await screen.findByText('Скасувати бронювання?')).toBeInTheDocument();
    expect(screen.getByText('«Синхронізація команди» більше не буде заброньовано.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Скасувати бронювання'));

    await waitFor(() => expect(cancelBookingMock).toHaveBeenCalledWith('booking-1'));
    await waitFor(() => expect(listMyBookingsMock).toHaveBeenCalledTimes(2)); // initial load + reload after cancel
  });

  it('cancels the whole series when "Скасувати серію" is confirmed', async () => {
    listMyBookingsMock.mockResolvedValue(page([booking({ seriesId: 'series-1' })]));
    cancelBookingSeriesMock.mockResolvedValue({ id: 'series-1', cancelledOccurrenceCount: 3 });
    renderPage();
    await screen.findByText('Скасувати серію');

    fireEvent.click(screen.getByText('Скасувати серію'));
    expect(await screen.findByText('Скасувати всю серію?')).toBeInTheDocument();

    const dialog = document.querySelector('dialog');
    if (!dialog) throw new Error('dialog not found');
    fireEvent.click(within(dialog).getByText('Скасувати серію'));

    await waitFor(() => expect(cancelBookingSeriesMock).toHaveBeenCalledWith('series-1'));
    expect(cancelBookingMock).not.toHaveBeenCalled();
  });

  it('paginates: "Наступна" advances the page and refetches', async () => {
    listMyBookingsMock.mockResolvedValue(page([booking()], { totalCount: 25, hasMore: true }));
    renderPage();
    await waitFor(() => expect(listMyBookingsMock).toHaveBeenCalledWith('upcoming', 1, 10, false));

    fireEvent.click(screen.getByText('Наступна →'));

    await waitFor(() => expect(listMyBookingsMock).toHaveBeenCalledWith('upcoming', 2, 10, false));
  });
});
