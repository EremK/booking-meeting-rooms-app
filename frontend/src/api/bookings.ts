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

export function createBooking(roomId: string, input: CreateBookingInput): Promise<CreatedBooking> {
  return api.post<CreatedBooking>(`/rooms/${roomId}/bookings`, input);
}
