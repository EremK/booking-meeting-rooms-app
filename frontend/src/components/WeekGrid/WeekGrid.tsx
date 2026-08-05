import { useEffect, useState } from 'react';
import type { ScheduleBooking } from '../../api/rooms';
import { getBookingPosition, getNowPosition, getSlotOffsetsMinutes, OFFICE_OPEN_HOUR } from '../../lib/schedule-grid';
import { formatDayHeader, formatTimeInZone, formatTimeRangeInZone, getTodayInZone, kyivMinutesToUtcIso, OFFICE_TIMEZONE } from '../../lib/timezone';
import styles from './WeekGrid.module.css';

const NOW_REFRESH_INTERVAL_MS = 60_000;

interface WeekGridProps {
  weekDates: string[];
  bookings: ScheduleBooking[];
  userTimeZone: string;
  currentUserId?: string;
  onCancelBooking?: (booking: ScheduleBooking) => void;
}

export function WeekGrid({ weekDates, bookings, userTimeZone, currentUserId, onCancelBooking }: WeekGridProps) {
  const slotOffsets = getSlotOffsetsMinutes();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), NOW_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const todayKyivDate = getTodayInZone(OFFICE_TIMEZONE);
  const nowPosition = getNowPosition(now, weekDates);

  return (
    <div className={styles.scrollArea}>
      <div className={styles.grid}>
        <div className={styles.timeColumn}>
          <div className={styles.cornerCell} />
          {slotOffsets.map((offsetMinutes) => (
            <div key={offsetMinutes} className={styles.timeLabel}>
              {formatSlotLabel(weekDates[0], offsetMinutes, userTimeZone)}
            </div>
          ))}
        </div>

        {weekDates.map((date, dayIndex) => {
          const dayBookings = bookings
            .map((booking) => ({ booking, position: getBookingPosition(booking, weekDates) }))
            .filter((entry) => entry.position?.dayIndex === dayIndex);
          const isToday = date === todayKyivDate;

          return (
            <div key={date} className={`${styles.dayColumn} ${isToday ? styles.todayColumn : ''}`}>
              <div className={styles.dayHeader}>{formatDayHeader(date)}</div>
              <div className={styles.dayBody}>
                {slotOffsets.map((offsetMinutes) => (
                  <div key={offsetMinutes} className={styles.slotCell} />
                ))}
                {nowPosition && nowPosition.dayIndex === dayIndex && (
                  <div className={styles.nowLine} style={{ top: `calc(${nowPosition.row} * var(--slot-height))` }} />
                )}
                {dayBookings.map(({ booking, position }) => {
                  const rowSpan = position!.endRow - position!.startRow;
                  const isOwn = booking.userId === currentUserId;
                  return (
                    <div
                      key={booking.id}
                      className={`${styles.booking} ${isOwn ? styles.ownBooking : styles.otherBooking}`}
                      style={{
                        top: `calc(${position!.startRow} * var(--slot-height))`,
                        height: `calc(${rowSpan} * var(--slot-height))`,
                      }}
                    >
                      {isOwn && onCancelBooking && (
                        <button
                          type="button"
                          className={styles.cancelButton}
                          aria-label="Скасувати бронювання"
                          onClick={(event) => {
                            event.stopPropagation();
                            onCancelBooking(booking);
                          }}
                        >
                          ×
                        </button>
                      )}
                      <span className={styles.bookingTime}>{formatTimeRangeInZone(booking.startAt, booking.endAt, userTimeZone)}</span>
                      <span className={styles.bookingTitle}>{booking.title}</span>
                      {/* A single 30-minute row can't fit a third line legibly. */}
                      {rowSpan > 1 && <span className={styles.bookingAuthor}>{booking.userName}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The row label for a slot: office-hours offset converted from Kyiv to the user's timezone. */
function formatSlotLabel(anyWeekDate: string, offsetMinutes: number, userTimeZone: string): string {
  const totalMinutes = OFFICE_OPEN_HOUR * 60 + offsetMinutes;
  const isoUtc = kyivMinutesToUtcIso(anyWeekDate, totalMinutes);
  return formatTimeInZone(isoUtc, userTimeZone);
}
