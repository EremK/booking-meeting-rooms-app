import { api } from './client';

export interface NotificationDto {
  id: string;
  bookingId: string;
  bookingTitle: string;
  roomName: string;
  endAt: string;
  createdAt: string;
}

export function listNotifications(): Promise<NotificationDto[]> {
  return api.get<NotificationDto[]>('/notifications');
}
