import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { cancelBooking } from '../api/bookings';
import { ApiError } from '../api/client';
import { getRoomSchedule, type ScheduleBooking, type WeeklySchedule } from '../api/rooms';
import { ConfirmDialog } from '../components/ConfirmDialog/ConfirmDialog';
import { CreateBookingForm } from '../components/CreateBookingForm/CreateBookingForm';
import { WeekGrid } from '../components/WeekGrid/WeekGrid';
import { useAuth } from '../auth/useAuth';
import { addDays, getWeekDates } from '../lib/schedule-grid';
import { getTodayInZone, getUserTimeZone, isSameTimeZone, OFFICE_TIMEZONE } from '../lib/timezone';
import styles from './RoomSchedulePage.module.css';

export function RoomSchedulePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const referenceDate = searchParams.get('date') ?? undefined;
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookingPendingCancellation, setBookingPendingCancellation] = useState<ScheduleBooking | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
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
    if (schedule) setSearchParams({ date: addDays(schedule.weekStartDate, -7) });
  }

  function goToNextWeek(): void {
    if (schedule) setSearchParams({ date: addDays(schedule.weekStartDate, 7) });
  }

  function goToToday(): void {
    setSearchParams({ date: getTodayInZone(OFFICE_TIMEZONE) });
  }

  async function handleConfirmCancel(): Promise<void> {
    if (!bookingPendingCancellation) return;
    setIsCancelling(true);
    setCancelError(null);
    try {
      await cancelBooking(bookingPendingCancellation.id);
      setBookingPendingCancellation(null);
      loadSchedule({ cancelled: false });
    } catch (requestError) {
      setCancelError(requestError instanceof ApiError ? requestError.message : 'Сталася невідома помилка.');
    } finally {
      setIsCancelling(false);
    }
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
          <div className={styles.toolbar}>
            <div className={styles.roomInfo}>
              <h1 className={styles.title}>{schedule.room.name}</h1>
              <span className={styles.meta}>
                Поверх {schedule.room.floor} · До {schedule.room.capacity} осіб
              </span>
            </div>

            <div className={styles.toolbarActions}>
              {!isSameTimeZone(userTimeZone, OFFICE_TIMEZONE) && (
                <span className={styles.tzNote} title={`Робочі години офісу: 09:00–19:00 за Києвом (${OFFICE_TIMEZONE})`}>
                  Ваш пояс: {userTimeZone}
                </span>
              )}
              <div className={styles.nav}>
                <button type="button" onClick={goToToday} disabled={isLoading}>
                  Сьогодні
                </button>
                <button type="button" onClick={goToPreviousWeek} disabled={isLoading} aria-label="Попередній тиждень">
                  ←
                </button>
                <button type="button" onClick={goToNextWeek} disabled={isLoading} aria-label="Наступний тиждень">
                  →
                </button>
              </div>
              {roomId && (
                <CreateBookingForm roomId={roomId} userTimeZone={userTimeZone} onCreated={() => loadSchedule({ cancelled: false })} />
              )}
            </div>
          </div>

          <WeekGrid
            weekDates={getWeekDates(schedule.weekStartDate)}
            bookings={schedule.bookings}
            userTimeZone={userTimeZone}
            currentUserId={user?.id}
            onCancelBooking={setBookingPendingCancellation}
          />
        </>
      )}

      <ConfirmDialog
        open={bookingPendingCancellation !== null}
        title="Скасувати бронювання?"
        message={bookingPendingCancellation ? `«${bookingPendingCancellation.title}» більше не буде заброньовано.` : ''}
        confirmLabel="Скасувати бронювання"
        cancelLabel="Назад"
        isConfirming={isCancelling}
        onConfirm={() => void handleConfirmCancel()}
        onCancel={() => setBookingPendingCancellation(null)}
      />
      {cancelError && <p className={styles.error}>{cancelError}</p>}
    </div>
  );
}
