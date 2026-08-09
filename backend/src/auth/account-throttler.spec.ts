import { getAccountTracker } from './account-throttler';

describe('getAccountTracker', () => {
  it('keys by the authenticated user when JwtAuthGuard has populated request.userId', () => {
    expect(getAccountTracker({ userId: 'user-1', ip: '10.0.0.1' })).toBe(
      'user:user-1',
    );
  });

  it('prefers the authenticated user over an email in the body', () => {
    expect(
      getAccountTracker({
        userId: 'user-1',
        body: { email: 'someone.else@example.com' },
        ip: '10.0.0.1',
      }),
    ).toBe('user:user-1');
  });

  it('keys by the normalized email when there is no authenticated user', () => {
    expect(
      getAccountTracker({
        body: { email: '  Hanna.Kuzmenko@Example.com  ' },
        ip: '10.0.0.1',
      }),
    ).toBe('email:hanna.kuzmenko@example.com');
  });

  it('gives two users behind the same office IP independent buckets', () => {
    const sharedIp = '203.0.113.7';
    const first = getAccountTracker({
      body: { email: 'hanna.kuzmenko@example.com' },
      ip: sharedIp,
    });
    const second = getAccountTracker({
      body: { email: 'ostap.haidamaka@example.com' },
      ip: sharedIp,
    });
    expect(first).not.toBe(second);
  });

  it('falls back to the IP when there is neither a user nor a usable email', () => {
    expect(getAccountTracker({ ip: '10.0.0.1' })).toBe('ip:10.0.0.1');
    expect(getAccountTracker({ body: {}, ip: '10.0.0.1' })).toBe('ip:10.0.0.1');
    expect(getAccountTracker({ body: { email: '   ' }, ip: '10.0.0.1' })).toBe(
      'ip:10.0.0.1',
    );
    expect(getAccountTracker({ body: { email: 42 }, ip: '10.0.0.1' })).toBe(
      'ip:10.0.0.1',
    );
  });
});
