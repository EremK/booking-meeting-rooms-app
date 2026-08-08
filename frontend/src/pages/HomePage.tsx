import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../api/client';
import { listRooms, type Room } from '../api/rooms';
import { useAuth } from '../auth/AuthContext';
import { EmailConfirmationBanner } from '../components/EmailConfirmationBanner/EmailConfirmationBanner';
import styles from './HomePage.module.css';

export function HomePage() {
  const { user, logout } = useAuth();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minCapacityInput, setMinCapacityInput] = useState('');

  const minCapacity = minCapacityInput ? Number(minCapacityInput) : undefined;

  useEffect(() => {
    let cancelled = false;
    setRooms(null);
    setError(null);
    listRooms(minCapacity)
      .then((result) => {
        if (!cancelled) setRooms(result);
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
      <header className={styles.header}>
        <h1 className={styles.title}>Вітаємо, {user?.name}</h1>
        <div className={styles.headerActions}>
          <Link to="/my-bookings" className={styles.myBookingsLink}>
            Мої бронювання
          </Link>
          <button type="button" className={styles.logout} onClick={() => void logout()}>
            Вийти
          </button>
        </div>
      </header>

      {user && !user.emailConfirmed && <EmailConfirmationBanner />}

      <div className={styles.filterBar}>
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

      {error && <p className={styles.error}>{error}</p>}
      {!error && !rooms && <p role="status">Завантаження кімнат…</p>}
      {rooms && rooms.length === 0 && (
        <p>{minCapacityInput ? 'Кімнат із такою місткістю немає.' : 'Кімнат поки немає.'}</p>
      )}

      {rooms && rooms.length > 0 && (
        <ul className={styles.roomList}>
          {rooms.map((room) => (
            <li key={room.id}>
              <Link to={`/rooms/${room.id}`} className={styles.roomCard}>
                <p className={styles.roomName}>{room.name}</p>
                <p className={styles.roomMeta}>
                  Поверх {room.floor} · До {room.capacity} осіб
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
