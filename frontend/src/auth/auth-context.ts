import { createContext } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
  emailConfirmed: boolean;
}

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetches the current session's user (e.g. after confirming email in this same browser). */
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
