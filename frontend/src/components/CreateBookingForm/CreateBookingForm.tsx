import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { createBooking, type CreatedBooking } from '../../api/bookings';
import { getTodayInZone, zonedWallTimeToUtcIso } from '../../lib/timezone';
import styles from './CreateBookingForm.module.css';

interface CreateBookingFormProps {
  roomId: string;
  userTimeZone: string;
  onCreated: (booking: CreatedBooking) => void;
}

function parseTimeToMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function CreateBookingForm({ roomId, userTimeZone, onCreated }: CreateBookingFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [date, setDate] = useState(() => getTodayInZone(userTimeZone));
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [title, setTitle] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function resetAndClose(): void {
    setIsOpen(false);
    setStartTime('');
    setEndTime('');
    setTitle('');
    setFieldErrors({});
    setGeneralError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFieldErrors({});
    setGeneralError(null);

    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);
    if (startMinutes === null || endMinutes === null) {
      setGeneralError('Вкажіть час початку та завершення');
      return;
    }

    setIsSubmitting(true);
    try {
      const booking = await createBooking(roomId, {
        title,
        startAt: zonedWallTimeToUtcIso(date, startMinutes, userTimeZone),
        endAt: zonedWallTimeToUtcIso(date, endMinutes, userTimeZone),
      });
      onCreated(booking);
      resetAndClose();
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

  if (!isOpen) {
    return (
      <div className={styles.wrapper}>
        <button type="button" className={styles.openButton} onClick={() => setIsOpen(true)}>
          + Забронювати
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
        {generalError && <p className={styles.formError}>{generalError}</p>}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="booking-date">
            Дата
          </label>
          <input
            id="booking-date"
            type="date"
            required
            value={date}
            disabled={isSubmitting}
            onChange={(event) => setDate(event.target.value)}
            className={styles.input}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="booking-start">
            Початок
          </label>
          <input
            id="booking-start"
            type="time"
            step={1800}
            required
            value={startTime}
            disabled={isSubmitting}
            onChange={(event) => setStartTime(event.target.value)}
            className={styles.input}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="booking-end">
            Кінець
          </label>
          <input
            id="booking-end"
            type="time"
            step={1800}
            required
            value={endTime}
            disabled={isSubmitting}
            onChange={(event) => setEndTime(event.target.value)}
            className={styles.input}
          />
        </div>

        <div className={`${styles.field} ${styles.titleField}`}>
          <label className={styles.label} htmlFor="booking-title">
            Назва
          </label>
          <input
            id="booking-title"
            type="text"
            required
            maxLength={100}
            value={title}
            disabled={isSubmitting}
            onChange={(event) => setTitle(event.target.value)}
            className={`${styles.input} ${fieldErrors.title ? styles.inputError : ''}`}
          />
          {fieldErrors.title?.map((message) => (
            <span key={message} className={styles.fieldError}>
              {message}
            </span>
          ))}
        </div>

        <div className={styles.actions}>
          <button type="submit" className={styles.submit} disabled={isSubmitting}>
            {isSubmitting ? 'Бронювання…' : 'Забронювати'}
          </button>
          <button type="button" className={styles.cancel} onClick={resetAndClose} disabled={isSubmitting}>
            Скасувати
          </button>
        </div>
      </form>
    </div>
  );
}
