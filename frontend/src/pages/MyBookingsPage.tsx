import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { cancelBooking } from '../api/bookings';
import { ApiError } from '../api/client';
import { listMyBookings, type MyBooking, type MyBookingsPage as MyBookingsPageResult } from '../api/my-bookings';
import { ConfirmDialog } from '../components/ConfirmDialog/ConfirmDialog';
import { formatDateInZone, formatTimeRangeInZone, getDateInZone, getUserTimeZone, OFFICE_TIMEZONE } from '../lib/timezone';
import styles from './MyBookingsPage.module.css';

type Section = 'upcoming' | 'past';
const PAGE_SIZE = 10;

export function MyBookingsPage() {
  const [section, setSection] = useState<Section>('upcoming');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MyBookingsPageResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookingPendingCancellation, setBookingPendingCancellation] = useState<MyBooking | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const userTimeZone = getUserTimeZone();

  const load = useCallback(
    (signal: { cancelled: boolean }) => {
      setIsLoading(true);
      setError(null);
      listMyBookings(section, page, PAGE_SIZE)
        .then((result) => {
          if (!signal.cancelled) setData(result);
        })
        .catch((requestError: unknown) => {
          if (signal.cancelled) return;
          setError(requestError instanceof ApiError ? requestError.message : 'Сталася невідома помилка.');
        })
        .finally(() => {
          if (!signal.cancelled) setIsLoading(false);
        });
    },
    [section, page],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  function switchSection(next: Section): void {
    setSection(next);
    setPage(1);
  }

  async function handleConfirmCancel(): Promise<void> {
    if (!bookingPendingCancellation) return;
    setIsCancelling(true);
    setError(null);
    try {
      await cancelBooking(bookingPendingCancellation.id);
      setBookingPendingCancellation(null);
      load({ cancelled: false });
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Сталася невідома помилка.');
    } finally {
      setIsCancelling(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE)) : 1;

  return (
    <div className={styles.page}>
      <Link to="/" className={styles.backLink}>
        ← Кімнати
      </Link>
      <h1 className={styles.title}>Мої бронювання</h1>

      <div className={styles.tabs}>
        <button type="button" className={section === 'upcoming' ? styles.tabActive : styles.tab} onClick={() => switchSection('upcoming')}>
          Майбутні
        </button>
        <button type="button" className={section === 'past' ? styles.tabActive : styles.tab} onClick={() => switchSection('past')}>
          Минулі
        </button>
      </div>

      {isLoading && !data && <p role="status">Завантаження…</p>}
      {error && <p className={styles.error}>{error}</p>}
      {data && data.items.length === 0 && <p className={styles.empty}>Бронювань немає.</p>}

      {data && data.items.length > 0 && (
        <ul className={styles.list}>
          {data.items.map((booking) => (
            <li key={booking.id} className={styles.row}>
              <Link
                to={`/rooms/${booking.room.id}?date=${getDateInZone(booking.startAt, OFFICE_TIMEZONE)}`}
                className={styles.rowLink}
              >
                <span className={styles.date}>{formatDateInZone(booking.startAt, userTimeZone)}</span>
                <span className={styles.time}>{formatTimeRangeInZone(booking.startAt, booking.endAt, userTimeZone)}</span>
                <span className={styles.room}>{booking.room.name}</span>
                <span className={styles.bookingTitle}>{booking.title}</span>
                {booking.cancelledAt && <span className={styles.cancelledBadge}>Скасовано</span>}
              </Link>
              {section === 'upcoming' && !booking.cancelledAt && (
                <button type="button" className={styles.cancelButton} onClick={() => setBookingPendingCancellation(booking)}>
                  Скасувати
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {data && data.totalCount > PAGE_SIZE && (
        <div className={styles.pagination}>
          <button type="button" disabled={page <= 1 || isLoading} onClick={() => setPage((current) => current - 1)}>
            ← Попередня
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button type="button" disabled={!data.hasMore || isLoading} onClick={() => setPage((current) => current + 1)}>
            Наступна →
          </button>
        </div>
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
    </div>
  );
}
