import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { getRoomSchedule, listRooms, type Room } from '../api/rooms';
import { useAuth } from '../auth/AuthContext';
import { EmailConfirmationBanner } from '../components/EmailConfirmationBanner/EmailConfirmationBanner';
import { getRoomStatus, type RoomStatus } from '../lib/room-status';
import { formatTimeInZone, getUserTimeZone } from '../lib/timezone';
import styles from './HomePage.module.css';

export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [statusByRoom, setStatusByRoom] = useState<Record<string, RoomStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [minCapacityInput, setMinCapacityInput] = useState('');
  const userTimeZone = getUserTimeZone();

  const minCapacity = minCapacityInput ? Number(minCapacityInput) : undefined;

  useEffect(() => {
    let cancelled = false;
    setRooms(null);
    setStatusByRoom({});
    setError(null);
    listRooms(minCapacity)
      .then((result) => {
        if (cancelled) return;
        setRooms(result);
        return Promise.all(
          result.map((room) =>
            getRoomSchedule(room.id)
              .then((schedule) => [room.id, getRoomStatus(schedule.bookings)] as const)
              .catch(() => null),
          ),
        );
      })
      .then((entries) => {
        if (cancelled || !entries) return;
        setStatusByRoom(Object.fromEntries(entries.filter((entry) => entry !== null)));
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(requestError instanceof ApiError ? requestError.message : 'Сталася невідома помилка.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [minCapacity]);

  return (
    <div className={styles.page}>
      {user && !user.emailConfirmed && <EmailConfirmationBanner />}

      <div className={styles.toolbar}>
        <h1 className={styles.title}>Кімнати</h1>
        <div className={styles.filter}>
          <label className={styles.filterLabel} htmlFor="min-capacity">
            Місткість від
          </label>
          <input
            id="min-capacity"
            type="number"
            min={1}
            placeholder="будь-яка"
            value={minCapacityInput}
            onChange={(event) => setMinCapacityInput(event.target.value)}
            className={styles.filterInput}
          />
          {minCapacityInput && (
            <button type="button" className={styles.filterReset} onClick={() => setMinCapacityInput('')}>
              Скинути
            </button>
          )}
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {!error && !rooms && <p role="status">Завантаження кімнат…</p>}
      {rooms && rooms.length === 0 && (
        <p className={styles.empty}>{minCapacityInput ? 'Кімнат із такою місткістю немає.' : 'Кімнат поки немає.'}</p>
      )}

      {rooms && rooms.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thRoom}>Кімната</th>
              <th>Поверх</th>
              <th>Місткість</th>
              <th>Статус</th>
              <th className={styles.thTimeline}>Сьогодні</th>
              <th>Наступне бронювання</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => {
              const status = statusByRoom[room.id];
              return (
                <tr key={room.id} className={styles.row} onClick={() => void navigate(`/rooms/${room.id}`)}>
                  <td className={styles.thRoom}>
                    <Link to={`/rooms/${room.id}`} className={styles.roomLink} onClick={(event) => event.stopPropagation()}>
                      {room.name}
                    </Link>
                  </td>
                  <td className={styles.muted}>{room.floor}</td>
                  <td className={styles.muted}>{room.capacity} осіб</td>
                  <td>
                    {status ? (
                      <span className={status.isAvailableNow ? styles.badgeAvailable : styles.badgeBusy}>
                        {status.isAvailableNow ? 'Вільна' : 'Зайнята'}
                      </span>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                  <td className={styles.thTimeline}>{status && <DayTimeline status={status} />}</td>
                  <td className={styles.muted}>
                    {status?.nextBooking
                      ? `${formatTimeInZone(status.nextBooking.startAt, userTimeZone)}–${formatTimeInZone(status.nextBooking.endAt, userTimeZone)}`
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DayTimeline({ status }: { status: RoomStatus }) {
  return (
    <div className={styles.timeline} aria-hidden="true">
      {status.timeline.map((block, index) => (
        <div
          key={index}
          className={styles.timelineBusy}
          style={{ left: `${block.startFraction * 100}%`, width: `${(block.endFraction - block.startFraction) * 100}%` }}
        />
      ))}
      {status.nowFraction !== null && <div className={styles.timelineNow} style={{ left: `${status.nowFraction * 100}%` }} />}
    </div>
  );
}
