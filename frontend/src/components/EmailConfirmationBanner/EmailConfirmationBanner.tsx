import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import styles from './EmailConfirmationBanner.module.css';

export function EmailConfirmationBanner() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleResend(): Promise<void> {
    setStatus('sending');
    setError(null);
    try {
      await api.post('/auth/resend-confirmation');
      setStatus('sent');
    } catch (requestError) {
      setStatus('error');
      setError(requestError instanceof ApiError ? requestError.message : 'Сталася невідома помилка.');
    }
  }

  return (
    <div className={styles.banner} role="status">
      <p className={styles.text}>
        Підтвердьте email, щоб бронювати переговорні. У dev-режимі посилання підтвердження виводиться в консоль
        сервера.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.resendButton} onClick={() => void handleResend()} disabled={status === 'sending'}>
          {status === 'sending' ? 'Надсилання…' : 'Надіслати ще раз'}
        </button>
        {status === 'sent' && <span className={styles.sent}>Нове посилання в консолі сервера.</span>}
        {status === 'error' && error && <span className={styles.error}>{error}</span>}
      </div>
    </div>
  );
}
