import { useAuth } from '../auth/AuthContext';
import styles from './HomePage.module.css';

export function HomePage() {
  const { user, logout } = useAuth();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Вітаємо, {user?.name}</h1>
        <button type="button" className={styles.logout} onClick={() => void logout()}>
          Вийти
        </button>
      </header>
      <p>Розклад переговорних кімнат зʼявиться тут.</p>
    </div>
  );
}
