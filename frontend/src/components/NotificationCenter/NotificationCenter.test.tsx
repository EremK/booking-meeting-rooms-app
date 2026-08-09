import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationDto } from '../../api/notifications';
import { NotificationCenter } from './NotificationCenter';

const { listNotificationsMock } = vi.hoisted(() => ({ listNotificationsMock: vi.fn() }));
vi.mock('../../api/notifications', () => ({ listNotifications: listNotificationsMock }));

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../auth/useAuth', () => ({ useAuth: useAuthMock }));

class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  closed = false;
  url: string;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  emit(payload: NotificationDto): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>);
  }
}

function notification(overrides: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id: 'notif-1',
    bookingId: 'booking-1',
    bookingTitle: 'Синхронізація команди',
    roomName: 'Альфа',
    endAt: '2026-08-10T08:00:00.000Z', // 11:00 Kyiv
    createdAt: '2026-08-10T07:50:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
  useAuthMock.mockReturnValue({ user: { id: 'user-1', name: 'Ганна Кузьменко', email: 'hanna@example.com', emailConfirmed: true } });
  listNotificationsMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('NotificationCenter', () => {
  it('renders nothing when there is no authenticated user', () => {
    useAuthMock.mockReturnValue({ user: null });
    const { container } = render(<NotificationCenter />);
    expect(container).toBeEmptyDOMElement();
  });

  it('loads existing notifications on mount without marking them unseen', async () => {
    listNotificationsMock.mockResolvedValue([notification()]);
    render(<NotificationCenter />);
    await waitFor(() => expect(listNotificationsMock).toHaveBeenCalledTimes(1));
    // The initial GET fetch shouldn't bump the unseen badge -- only live SSE pushes do.
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('shows the fetched notifications when the bell is opened', async () => {
    listNotificationsMock.mockResolvedValue([notification()]);
    render(<NotificationCenter />);
    await waitFor(() => expect(listNotificationsMock).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText('Сповіщення'));

    expect(screen.getByText('Синхронізація команди')).toBeInTheDocument();
    expect(screen.getByText(/Альфа/)).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no notifications', async () => {
    render(<NotificationCenter />);
    await waitFor(() => expect(listNotificationsMock).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText('Сповіщення'));
    expect(screen.getByText('Сповіщень немає.')).toBeInTheDocument();
  });

  it('bumps the unseen badge and shows a toast when a live SSE notification arrives', async () => {
    render(<NotificationCenter />);
    await waitFor(() => expect(listNotificationsMock).toHaveBeenCalled());

    expect(MockEventSource.instances).toHaveLength(1);
    MockEventSource.instances[0].emit(notification());

    expect(await screen.findByText('1')).toBeInTheDocument();
    expect(screen.getByText('«Синхронізація команди» скоро звільниться')).toBeInTheDocument();
  });

  it('clears the unseen badge when the bell is opened', async () => {
    render(<NotificationCenter />);
    await waitFor(() => expect(listNotificationsMock).toHaveBeenCalled());
    MockEventSource.instances[0].emit(notification());
    expect(await screen.findByText('1')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Сповіщення'));

    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('closes the SSE connection on unmount', async () => {
    const { unmount } = render(<NotificationCenter />);
    await waitFor(() => expect(listNotificationsMock).toHaveBeenCalled());
    const source = MockEventSource.instances[0];
    unmount();
    expect(source.closed).toBe(true);
  });
});
