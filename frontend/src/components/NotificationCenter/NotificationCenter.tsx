import { useEffect, useState } from 'react';
import { API_URL } from '../../api/client';
import { listNotifications, type NotificationDto } from '../../api/notifications';
import { useAuth } from '../../auth/useAuth';
import { formatTimeInZone, getUserTimeZone } from '../../lib/timezone';
import styles from './NotificationCenter.module.css';

const TOAST_DURATION_MS = 8000;

function addUnique(current: NotificationDto[], incoming: NotificationDto): NotificationDto[] {
  if (current.some((notification) => notification.id === incoming.id)) {
    return current;
  }
  return [incoming, ...current];
}

export function NotificationCenter() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [toasts, setToasts] = useState<NotificationDto[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const userTimeZone = getUserTimeZone();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listNotifications()
      .then((result) => {
        if (!cancelled) setNotifications(result);
      })
      .catch(() => {
        // Non-critical: the bell just starts empty and fills in via SSE.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const source = new EventSource(`${API_URL}/notifications/stream`, { withCredentials: true });
    source.onmessage = (event: MessageEvent<string>) => {
      const notification = JSON.parse(event.data) as NotificationDto;
      setNotifications((current) => addUnique(current, notification));
      setUnseenCount((count) => count + 1);
      setToasts((current) => [...current, notification]);
      setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== notification.id));
      }, TOAST_DURATION_MS);
    };

    return () => source.close();
  }, [user]);

  if (!user) {
    return null;
  }

  function toggleOpen(): void {
    setIsOpen((open) => !open);
    setUnseenCount(0);
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.bellArea}>
        <button type="button" className={styles.bellButton} onClick={toggleOpen} aria-label="Сповіщення">
          <BellIcon />
          {unseenCount > 0 && (
            <span className={styles.badge} aria-hidden="true">
              {unseenCount}
            </span>
          )}
        </button>

        {isOpen && (
          <div className={styles.dropdown}>
            <p className={styles.dropdownTitle}>Сповіщення</p>
            {notifications.length === 0 && <p className={styles.empty}>Сповіщень немає.</p>}
            {notifications.length > 0 && (
              <ul className={styles.list}>
                {notifications.map((notification) => (
                  <li key={notification.id} className={styles.item}>
                    <span className={styles.itemTitle}>{notification.bookingTitle}</span>
                    <span className={styles.itemMeta}>
                      {notification.roomName} · завершується о {formatTimeInZone(notification.endAt, userTimeZone)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className={styles.toastStack}>
        {toasts.map((toast) => (
          <div key={toast.id} className={styles.toast} role="status">
            <p className={styles.toastTitle}>«{toast.bookingTitle}» скоро звільниться</p>
            <p className={styles.toastMeta}>
              {toast.roomName} · до {formatTimeInZone(toast.endAt, userTimeZone)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
