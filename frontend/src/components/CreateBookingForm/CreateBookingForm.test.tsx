import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { CreateBookingForm } from './CreateBookingForm';

const { createBookingMock, createBookingSeriesMock } = vi.hoisted(() => ({
  createBookingMock: vi.fn(),
  createBookingSeriesMock: vi.fn(),
}));
vi.mock('../../api/bookings', () => ({
  createBooking: createBookingMock,
  createBookingSeries: createBookingSeriesMock,
}));

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../auth/useAuth', () => ({ useAuth: useAuthMock }));

function fillBasicFields(): void {
  fireEvent.change(screen.getByLabelText('Дата'), { target: { value: '2026-08-10' } });
  fireEvent.change(screen.getByLabelText('Початок'), { target: { value: '10:00' } });
  fireEvent.change(screen.getByLabelText('Кінець'), { target: { value: '11:00' } });
  fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Синхронізація команди' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ user: { id: 'user-1', name: 'Ганна Кузьменко', email: 'hanna@example.com', emailConfirmed: true } });
});

describe('CreateBookingForm', () => {
  it("shows an unconfirmed-email notice instead of the booking button when the user hasn't confirmed", () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-1', name: 'X', email: 'x@example.com', emailConfirmed: false } });
    render(<CreateBookingForm roomId="room-1" userTimeZone="Europe/Kyiv" onCreated={() => {}} />);
    expect(screen.getByText('Підтвердьте email, щоб бронювати переговорні.')).toBeInTheDocument();
    expect(screen.queryByText('+ Забронювати')).not.toBeInTheDocument();
  });

  it('opens the form when the trigger button is clicked', () => {
    render(<CreateBookingForm roomId="room-1" userTimeZone="Europe/Kyiv" onCreated={() => {}} />);
    fireEvent.click(screen.getByText('+ Забронювати'));
    expect(screen.getByLabelText('Дата')).toBeInTheDocument();
    expect(screen.getByLabelText('Назва')).toBeInTheDocument();
  });

  it('submits a single booking with times converted to UTC and calls onCreated', async () => {
    const created = { id: 'b1', title: 'Синхронізація команди', startAt: '2026-08-10T07:00:00.000Z', endAt: '2026-08-10T08:00:00.000Z', userId: 'user-1', userName: 'Ганна Кузьменко' };
    createBookingMock.mockResolvedValue(created);
    const onCreated = vi.fn();

    render(<CreateBookingForm roomId="room-1" userTimeZone="Europe/Kyiv" onCreated={onCreated} />);
    fireEvent.click(screen.getByText('+ Забронювати'));
    fillBasicFields();
    fireEvent.click(screen.getByText('Забронювати'));

    await waitFor(() => expect(createBookingMock).toHaveBeenCalledWith('room-1', {
      title: 'Синхронізація команди',
      startAt: '2026-08-10T07:00:00.000Z', // 10:00 Kyiv (EEST, UTC+3)
      endAt: '2026-08-10T08:00:00.000Z',
    }));
    expect(onCreated).toHaveBeenCalledWith(created);
    // The form resets and closes back to the trigger button after a successful submit.
    expect(await screen.findByText('+ Забронювати')).toBeInTheDocument();
  });

  it('submits a weekly series when "Повторювати щотижня" is checked', async () => {
    const occurrence = { id: 'b1', title: 'Синхронізація команди', startAt: '2026-08-10T07:00:00.000Z', endAt: '2026-08-10T08:00:00.000Z', userId: 'user-1', userName: 'Ганна Кузьменко' };
    createBookingSeriesMock.mockResolvedValue({ id: 'series-1', title: 'Синхронізація команди', occurrenceCount: 8, occurrences: [occurrence] });
    const onCreated = vi.fn();

    render(<CreateBookingForm roomId="room-1" userTimeZone="Europe/Kyiv" onCreated={onCreated} />);
    fireEvent.click(screen.getByText('+ Забронювати'));
    fillBasicFields();
    fireEvent.click(screen.getByLabelText('Повторювати щотижня'));
    expect(screen.getByLabelText('Кількість повторень')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Забронювати'));

    await waitFor(() =>
      expect(createBookingSeriesMock).toHaveBeenCalledWith('room-1', {
        title: 'Синхронізація команди',
        startAt: '2026-08-10T07:00:00.000Z',
        endAt: '2026-08-10T08:00:00.000Z',
        occurrenceCount: 8,
      }),
    );
    expect(createBookingMock).not.toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledWith(occurrence);
  });

  it('shows field-specific errors from the API next to the relevant field', async () => {
    createBookingMock.mockRejectedValue(new ApiError('Помилка валідації', 400, { title: ['Назва занадто довга'] }));

    render(<CreateBookingForm roomId="room-1" userTimeZone="Europe/Kyiv" onCreated={() => {}} />);
    fireEvent.click(screen.getByText('+ Забронювати'));
    fillBasicFields();
    fireEvent.click(screen.getByText('Забронювати'));

    expect(await screen.findByText('Назва занадто довга')).toBeInTheDocument();
    // The form stays open on failure so the user can fix and retry.
    expect(screen.getByLabelText('Назва')).toBeInTheDocument();
  });

  it('shows a general error message when the API rejects without field errors', async () => {
    createBookingMock.mockRejectedValue(new ApiError('Цей час уже заброньовано', 409));

    render(<CreateBookingForm roomId="room-1" userTimeZone="Europe/Kyiv" onCreated={() => {}} />);
    fireEvent.click(screen.getByText('+ Забронювати'));
    fillBasicFields();
    fireEvent.click(screen.getByText('Забронювати'));

    expect(await screen.findByText('Цей час уже заброньовано')).toBeInTheDocument();
  });

  it('disables the submit button and shows a pending label while submitting', async () => {
    let resolveCreate!: (value: unknown) => void;
    createBookingMock.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));

    render(<CreateBookingForm roomId="room-1" userTimeZone="Europe/Kyiv" onCreated={() => {}} />);
    fireEvent.click(screen.getByText('+ Забронювати'));
    fillBasicFields();
    fireEvent.click(screen.getByText('Забронювати'));

    expect(await screen.findByText('Бронювання…')).toBeDisabled();

    resolveCreate({ id: 'b1', title: 'X', startAt: '2026-08-10T07:00:00.000Z', endAt: '2026-08-10T08:00:00.000Z', userId: 'user-1', userName: 'Y' });
    await waitFor(() => expect(screen.queryByText('Бронювання…')).not.toBeInTheDocument());
  });

  it('closes and resets the form without calling the API when cancelled', () => {
    render(<CreateBookingForm roomId="room-1" userTimeZone="Europe/Kyiv" onCreated={() => {}} />);
    fireEvent.click(screen.getByText('+ Забронювати'));
    fillBasicFields();
    fireEvent.click(screen.getByText('Скасувати'));

    expect(screen.getByText('+ Забронювати')).toBeInTheDocument();
    expect(createBookingMock).not.toHaveBeenCalled();
  });
});
