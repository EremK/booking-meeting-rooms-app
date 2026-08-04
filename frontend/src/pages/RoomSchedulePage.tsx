import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { getRoomSchedule, type WeeklySchedule } from '../api/rooms';
import { CreateBookingForm } from '../components/CreateBookingForm/CreateBookingForm';
import { WeekGrid } from '../components/WeekGrid/WeekGrid';
import { addDays, getWeekDates } from '../lib/schedule-grid';
import { getUserTimeZone, isSameTimeZone, OFFICE_TIMEZONE } from '../lib/timezone';
import styles from './RoomSchedulePage.module.css';

export function RoomSchedulePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [referenceDate, setReferenceDate] = useState<string | undefined>(undefined);
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userTimeZone = getUserTimeZone();

  const loadSchedule = useCallback(
    (signal: { cancelled: boolean }) => {
      if (!roomId) return;
      setIsLoading(true);
      setError(null);
      getRoomSchedule(roomId, referenceDate)
        .then((result) => {
          if (!signal.cancelled) setSchedule(result);
        })
        .catch((requestError: unknown) => {
          if (signal.cancelled) return;
          setError(requestError instanceof ApiError ? requestError.message : 'Сталася невідома помилка.');
        })
        .finally(() => {
          if (!signal.cancelled) setIsLoading(false);
        });
    },
    [roomId, referenceDate],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    loadSchedule(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [loadSchedule]);

  function goToPreviousWeek(): void {
    if (schedule) setReferenceDate(addDays(schedule.weekStartDate, -7));
  }

  function goToNextWeek(): void {
    if (schedule) setReferenceDate(addDays(schedule.weekStartDate, 7));
  }

  return (
    <div className={styles.page}>
      <Link to="/" className={styles.backLink}>
        ← Кімнати
      </Link>

      {isLoading && !schedule && <p role="status">Завантаження…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {schedule && (
        <>
          <header className={styles.header}>
            <div>
              <h1 className={styles.title}>{schedule.room.name}</h1>
              <p className={styles.meta}>
                Поверх {schedule.room.floor} · До {schedule.room.capacity} осіб
              </p>
            </div>
            <div className={styles.nav}>
              <button type="button" onClick={goToPreviousWeek} disabled={isLoading}>
                ← Попередній тиждень
              </button>
              <button type="button" onClick={goToNextWeek} disabled={isLoading}>
                Наступний тиждень →
              </button>
            </div>
          </header>

          {!isSameTimeZone(userTimeZone, OFFICE_TIMEZONE) && (
            <p className={styles.tzNote}>
              Ваш часовий пояс: {userTimeZone}. Робочі години офісу: 09:00–19:00 за Києвом ({OFFICE_TIMEZONE}).
            </p>
          )}

          {roomId && (
            <CreateBookingForm roomId={roomId} userTimeZone={userTimeZone} onCreated={() => loadSchedule({ cancelled: false })} />
          )}

          <WeekGrid weekDates={getWeekDates(schedule.weekStartDate)} bookings={schedule.bookings} userTimeZone={userTimeZone} />
        </>
      )}
    </div>
  );
}
