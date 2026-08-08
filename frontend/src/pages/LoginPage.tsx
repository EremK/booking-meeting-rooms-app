import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import styles from './AuthForm.module.css';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFieldErrors({});
    setGeneralError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      void navigate('/');
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors) {
        setFieldErrors(error.fieldErrors);
      } else if (error instanceof ApiError) {
        setGeneralError(error.message);
      } else {
        setGeneralError('Сталася невідома помилка.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <img src="/white-calendar-mascot.png" alt="" width={56} height={56} className={styles.mascot} />
          <h1 className={styles.title}>Вхід до Переговорні UA</h1>
        </div>
        <form className={styles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
          {generalError && <p className={styles.formError}>{generalError}</p>}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              disabled={isSubmitting}
              onChange={(event) => setEmail(event.target.value)}
              className={`${styles.input} ${fieldErrors.email ? styles.inputError : ''}`}
            />
            {fieldErrors.email?.map((message) => (
              <span key={message} className={styles.fieldError}>
                {message}
              </span>
            ))}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Пароль
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={isSubmitting}
              onChange={(event) => setPassword(event.target.value)}
              className={`${styles.input} ${fieldErrors.password ? styles.inputError : ''}`}
            />
            {fieldErrors.password?.map((message) => (
              <span key={message} className={styles.fieldError}>
                {message}
              </span>
            ))}
          </div>

          <button type="submit" className={styles.submit} disabled={isSubmitting}>
            {isSubmitting ? 'Вхід…' : 'Увійти'}
          </button>
        </form>

        <p className={styles.switchLink}>
          Немає акаунту? <Link to="/register">Зареєструватися</Link>
        </p>
      </div>
    </div>
  );
}
