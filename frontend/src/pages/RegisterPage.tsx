import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import styles from './AuthForm.module.css';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
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
      await register(name, email, password);
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
          <h1 className={styles.title}>Реєстрація в Переговорні UA</h1>
        </div>
        <form className={styles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
          {generalError && <p className={styles.formError}>{generalError}</p>}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">
              Ім'я
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              disabled={isSubmitting}
              onChange={(event) => setName(event.target.value)}
              className={`${styles.input} ${fieldErrors.name ? styles.inputError : ''}`}
            />
            {fieldErrors.name?.map((message) => (
              <span key={message} className={styles.fieldError}>
                {message}
              </span>
            ))}
          </div>

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
              autoComplete="new-password"
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
            {isSubmitting ? 'Реєстрація…' : 'Зареєструватися'}
          </button>
        </form>

        <p className={styles.switchLink}>
          Вже є акаунт? <Link to="/login">Увійти</Link>
        </p>
      </div>
    </div>
  );
}
