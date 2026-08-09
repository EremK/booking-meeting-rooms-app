import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { cancelBooking, cancelBookingSeries } from '../api/bookings';
import { ApiError } from '../api/client';
import { listMyBookings, type MyBooking, type MyBookingsPage as MyBookingsPageResult } from '../api/my-bookings';
import { ConfirmDialog } from '../components/ConfirmDialog/ConfirmDialog';
import { formatDateInZone, formatTimeRangeInZone, getDateInZone, getUserTimeZone, OFFICE_TIMEZONE } from '../lib/timezone';
import styles from './MyBookingsPage.module.css';

type Section = 'upcoming' | 'past';
type CancelMode = 'occurrence' | 'series';
const PAGE_SIZE = 10;

export function MyBookingsPage() {
  const [section, setSection] = useState<Section>('upcoming');
  const [page, setPage] = useState(1);
  const [showCancelled, setShowCancelled] = useState(false);
  const [data, setData] = useState<MyBookingsPageResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ booking: MyBooking; mode: CancelMode } | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const userTimeZone = getUserTimeZone();

  const load = useCallback(
    (signal: { cancelled: boolean }) => {
      setIsLoading(true);
      setError(null);
      listMyBookings(section, page, PAGE_SIZE, showCancelled)
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
    [section, page, showCancelled],
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

  function toggleShowCancelled(): void {
    setShowCancelled((current) => !current);
    setPage(1);
  }

  async function handleConfirmCancel(): Promise<void> {
    if (!cancelTarget) return;
    setIsCancelling(true);
    setError(null);
    try {
      if (cancelTarget.mode === 'series' && cancelTarget.booking.seriesId) {
        await cancelBookingSeries(cancelTarget.booking.seriesId);
      } else {
        await cancelBooking(cancelTarget.booking.id);
      }
      setCancelTarget(null);
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
      <div className={styles.toolbar}>
        <h1 className={styles.title}>Мої бронювання</h1>
        <div className={styles.controls}>
          <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={showCancelled} onChange={toggleShowCancelled} />
            Показувати скасовані
          </label>
          <div className={styles.tabs}>
            <button type="button" className={section === 'upcoming' ? styles.tabActive : styles.tab} onClick={() => switchSection('upcoming')}>
              Майбутні
            </button>
            <button type="button" className={section === 'past' ? styles.tabActive : styles.tab} onClick={() => switchSection('past')}>
              Минулі
            </button>
          </div>
        </div>
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
                <span className={styles.badges}>
                  {booking.seriesId && <span className={styles.recurringBadge}>Серія</span>}
                  {booking.cancelledAt && <span className={styles.cancelledBadge}>Скасовано</span>}
                </span>
              </Link>
              {section === 'upcoming' && !booking.cancelledAt && (
                <div className={styles.rowActions}>
                  <button type="button" className={styles.cancelButton} onClick={() => setCancelTarget({ booking, mode: 'occurrence' })}>
                    Скасувати
                  </button>
                  {booking.seriesId && (
                    <button type="button" className={styles.cancelButton} onClick={() => setCancelTarget({ booking, mode: 'series' })}>
                      Скасувати серію
                    </button>
                  )}
                </div>
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
        open={cancelTarget !== null}
        title={cancelTarget?.mode === 'series' ? 'Скасувати всю серію?' : 'Скасувати бронювання?'}
        message={
          cancelTarget
            ? cancelTarget.mode === 'series'
              ? `«${cancelTarget.booking.title}» — усі ще активні повторення цієї серії буде скасовано.`
              : `«${cancelTarget.booking.title}» більше не буде заброньовано.`
            : ''
        }
        confirmLabel={cancelTarget?.mode === 'series' ? 'Скасувати серію' : 'Скасувати бронювання'}
        cancelLabel="Назад"
        isConfirming={isCancelling}
        onConfirm={() => void handleConfirmCancel()}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
