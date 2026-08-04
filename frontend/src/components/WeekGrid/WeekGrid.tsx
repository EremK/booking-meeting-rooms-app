import type { ScheduleBooking } from '../../api/rooms';
import { getBookingPosition, getSlotOffsetsMinutes, OFFICE_OPEN_HOUR } from '../../lib/schedule-grid';
import { formatDayHeader, formatTimeInZone, formatTimeRangeInZone, kyivMinutesToUtcIso } from '../../lib/timezone';
import styles from './WeekGrid.module.css';

interface WeekGridProps {
  weekDates: string[];
  bookings: ScheduleBooking[];
  userTimeZone: string;
}

export function WeekGrid({ weekDates, bookings, userTimeZone }: WeekGridProps) {
  const slotOffsets = getSlotOffsetsMinutes();

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

          return (
            <div key={date} className={styles.dayColumn}>
              <div className={styles.dayHeader}>{formatDayHeader(date)}</div>
              <div className={styles.dayBody}>
                {slotOffsets.map((offsetMinutes) => (
                  <div key={offsetMinutes} className={styles.slotCell} />
                ))}
                {dayBookings.map(({ booking, position }) => {
                  const rowSpan = position!.endRow - position!.startRow;
                  return (
                    <div
                      key={booking.id}
                      className={styles.booking}
                      style={{
                        top: `calc(${position!.startRow} * var(--slot-height))`,
                        height: `calc(${rowSpan} * var(--slot-height))`,
                      }}
                    >
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
