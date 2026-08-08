import { api } from './client';

export interface Room {
  id: string;
  name: string;
  floor: number;
  capacity: number;
}

export interface ScheduleBooking {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  userId: string;
  userName: string;
}

export interface WeeklySchedule {
  room: Room;
  weekStartDate: string;
  officeTimezone: string;
  bookings: ScheduleBooking[];
}

export function listRooms(minCapacity?: number): Promise<Room[]> {
  const query = minCapacity ? `?minCapacity=${minCapacity}` : '';
  return api.get<Room[]>(`/rooms${query}`);
}

export function getRoomSchedule(roomId: string, date?: string): Promise<WeeklySchedule> {
  const query = date ? `?date=${date}` : '';
  return api.get<WeeklySchedule>(`/rooms/${roomId}/schedule${query}`);
}
