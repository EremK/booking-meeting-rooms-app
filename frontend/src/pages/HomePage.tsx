import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../api/client';
import { listRooms, type Room } from '../api/rooms';
import { useAuth } from '../auth/AuthContext';
import styles from './HomePage.module.css';

export function HomePage() {
  const { user, logout } = useAuth();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listRooms()
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
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Вітаємо, {user?.name}</h1>
        <button type="button" className={styles.logout} onClick={() => void logout()}>
          Вийти
        </button>
      </header>

      {error && <p className={styles.error}>{error}</p>}
      {!error && !rooms && <p role="status">Завантаження кімнат…</p>}
      {rooms && rooms.length === 0 && <p>Кімнат поки немає.</p>}

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
