import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleBooking } from '../../api/rooms';
import { WeekGrid } from './WeekGrid';

const WEEK_DATES = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16'];

function booking(overrides: Partial<ScheduleBooking> = {}): ScheduleBooking {
  return {
    id: 'booking-1',
    title: 'Синхронізація команди',
    startAt: '2026-08-10T07:00:00.000Z', // 10:00 Kyiv
    endAt: '2026-08-10T08:00:00.000Z', // 11:00 Kyiv
    userId: 'user-1',
    userName: 'Ганна Кузьменко',
    ...overrides,
  };
}

describe('WeekGrid', () => {
  it('renders one day header per week date', () => {
    render(<WeekGrid weekDates={WEEK_DATES} bookings={[]} userTimeZone="Europe/Kyiv" />);
    // Day headers carry the full formatted date as an aria-label, e.g. "пн, 10 серп.".
    expect(screen.getAllByLabelText(/серп\./)).toHaveLength(7);
  });

  it('shows the booking title and time range converted to the given user timezone', () => {
    render(<WeekGrid weekDates={WEEK_DATES} bookings={[booking()]} userTimeZone="Europe/Berlin" />);
    expect(screen.getByText('Синхронізація команди')).toBeInTheDocument();
    // 10:00-11:00 Kyiv (EEST, UTC+3) = 09:00-10:00 Berlin (CEST, UTC+2) -- the task's own example, one hour later.
    expect(screen.getByText('09:00–10:00')).toBeInTheDocument();
  });

  it("shows the author's name only when the booking spans more than one slot", () => {
    const { rerender } = render(
      <WeekGrid
        weekDates={WEEK_DATES}
        bookings={[booking({ startAt: '2026-08-10T07:00:00.000Z', endAt: '2026-08-10T07:30:00.000Z' })]} // 30min
        userTimeZone="Europe/Kyiv"
      />,
    );
    expect(screen.queryByText('Ганна Кузьменко')).not.toBeInTheDocument();

    rerender(
      <WeekGrid
        weekDates={WEEK_DATES}
        bookings={[booking({ startAt: '2026-08-10T07:00:00.000Z', endAt: '2026-08-10T08:00:00.000Z' })]} // 60min
        userTimeZone="Europe/Kyiv"
      />,
    );
    expect(screen.getByText('Ганна Кузьменко')).toBeInTheDocument();
  });

  it('shows a cancel button only for the current user\'s own booking', () => {
    const { rerender } = render(
      <WeekGrid weekDates={WEEK_DATES} bookings={[booking({ userId: 'someone-else' })]} userTimeZone="Europe/Kyiv" currentUserId="user-1" onCancelBooking={() => {}} />,
    );
    expect(screen.queryByLabelText('Скасувати бронювання')).not.toBeInTheDocument();

    rerender(
      <WeekGrid weekDates={WEEK_DATES} bookings={[booking({ userId: 'user-1' })]} userTimeZone="Europe/Kyiv" currentUserId="user-1" onCancelBooking={() => {}} />,
    );
    expect(screen.getByLabelText('Скасувати бронювання')).toBeInTheDocument();
  });

  it('calls onCancelBooking with the booking when its cancel button is clicked', () => {
    const onCancelBooking = vi.fn();
    const target = booking({ userId: 'user-1' });
    render(
      <WeekGrid weekDates={WEEK_DATES} bookings={[target]} userTimeZone="Europe/Kyiv" currentUserId="user-1" onCancelBooking={onCancelBooking} />,
    );
    fireEvent.click(screen.getByLabelText('Скасувати бронювання'));
    expect(onCancelBooking).toHaveBeenCalledWith(target);
  });

  it('renders an empty grid (no crash, no booking blocks) when there are no bookings', () => {
    render(<WeekGrid weekDates={WEEK_DATES} bookings={[]} userTimeZone="Europe/Kyiv" />);
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });

  it('does not render a booking whose date falls outside the displayed week', () => {
    render(
      <WeekGrid
        weekDates={WEEK_DATES}
        bookings={[booking({ startAt: '2026-09-01T07:00:00.000Z', endAt: '2026-09-01T08:00:00.000Z' })]}
        userTimeZone="Europe/Kyiv"
      />,
    );
    expect(screen.queryByText('Синхронізація команди')).not.toBeInTheDocument();
  });
});
