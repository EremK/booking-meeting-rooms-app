import { api } from './client';

export interface CreateBookingInput {
  title: string;
  startAt: string;
  endAt: string;
}

export interface CreatedBooking {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  userId: string;
  userName: string;
}

export interface CreateBookingSeriesInput {
  title: string;
  startAt: string;
  endAt: string;
  occurrenceCount: number;
}

export interface CreatedBookingSeries {
  id: string;
  title: string;
  occurrenceCount: number;
  occurrences: CreatedBooking[];
}

export interface CancelledSeries {
  id: string;
  cancelledOccurrenceCount: number;
}

export function createBooking(roomId: string, input: CreateBookingInput): Promise<CreatedBooking> {
  return api.post<CreatedBooking>(`/rooms/${roomId}/bookings`, input);
}

export function createBookingSeries(roomId: string, input: CreateBookingSeriesInput): Promise<CreatedBookingSeries> {
  return api.post<CreatedBookingSeries>(`/rooms/${roomId}/bookings/series`, input);
}

export function cancelBooking(bookingId: string): Promise<CreatedBooking> {
  return api.post<CreatedBooking>(`/bookings/${bookingId}/cancel`);
}

export function cancelBookingSeries(seriesId: string): Promise<CancelledSeries> {
  return api.post<CancelledSeries>(`/bookings/series/${seriesId}/cancel`);
}
