import { api } from './client';

export interface MyBooking {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  cancelledAt: string | null;
  room: { id: string; name: string };
}

export interface MyBookingsPage {
  items: MyBooking[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
}

export function listMyBookings(section: 'upcoming' | 'past', page: number, pageSize: number): Promise<MyBookingsPage> {
  return api.get<MyBookingsPage>(`/bookings/me?section=${section}&page=${page}&pageSize=${pageSize}`);
}
