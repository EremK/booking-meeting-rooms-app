import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../../auth/useAuth';
import { NotificationCenter } from '../NotificationCenter/NotificationCenter';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
}

/**
 * Compact, visually secondary nav shared by every authenticated page.
 * Deliberately does not duplicate the room list here (ROOMS is the app's
 * primary content, not sidebar furniture) and does not use the mascot as
 * a logo -- that's reserved for auth/landing.
 */
export function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isRooms = location.pathname === '/' || location.pathname.startsWith('/rooms');
  const isMyBookings = location.pathname.startsWith('/my-bookings');

  return (
    <div className={styles.shell}>
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <div className={styles.navGroup}>
            <Link to="/" className={styles.brand}>
              <img src="/calendar-pictogram.png" alt="" width={32} height={32} className={styles.brandMark} />
              <span className={styles.brandName}>Переговорні UA</span>
            </Link>
            <nav className={styles.links} aria-label="Основна навігація">
              <Link to="/" className={isRooms ? styles.linkActive : styles.link}>
                Кімнати
              </Link>
              <Link to="/my-bookings" className={isMyBookings ? styles.linkActive : styles.link}>
                Мої бронювання
              </Link>
            </nav>
          </div>
          <div className={styles.navGroup}>
            <NotificationCenter />
            {user && <span className={styles.userName}>{user.name}</span>}
            <button type="button" className={styles.logoutButton} onClick={() => void logout()}>
              Вийти
            </button>
          </div>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
