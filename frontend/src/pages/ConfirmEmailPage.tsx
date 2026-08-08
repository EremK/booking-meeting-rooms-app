import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import styles from './AuthForm.module.css';

type Status = 'confirming' | 'success' | 'error';

export function ConfirmEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<Status>('confirming');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('Посилання підтвердження неповне: відсутній токен.');
      return;
    }

    let cancelled = false;
    api
      .post('/auth/confirm-email', { token })
      .then(() => refreshUser())
      .then(() => {
        if (!cancelled) setStatus('success');
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setError(requestError instanceof ApiError ? requestError.message : 'Сталася невідома помилка.');
      });
    return () => {
      cancelled = true;
    };
  }, [token, refreshUser]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Підтвердження email</h1>

        {status === 'confirming' && <p className={styles.status} role="status">Підтверджуємо…</p>}
        {status === 'success' && <p className={styles.success}>Email підтверджено. Тепер можна бронювати переговорні.</p>}
        {status === 'error' && error && <p className={styles.formError}>{error}</p>}

        <p className={styles.switchLink}>
          <Link to="/">На головну</Link>
        </p>
      </div>
    </div>
  );
}
