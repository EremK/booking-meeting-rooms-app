import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { AuthContext, type User } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<User>('/auth/me')
      .then((currentUser) => {
        if (!cancelled) setUser(currentUser);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const currentUser = await api.post<User>('/auth/login', { email, password });
    setUser(currentUser);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const currentUser = await api.post<User>('/auth/register', { name, email, password });
    setUser(currentUser);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await api.get<User>('/auth/me');
      setUser(currentUser);
    } catch {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refreshUser }}>{children}</AuthContext.Provider>
  );
}
