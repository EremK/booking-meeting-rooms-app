import { Navigate, Outlet } from 'react-router';
import { NotificationCenter } from '../components/NotificationCenter/NotificationCenter';
import { useAuth } from './AuthContext';

export function RequireAuth() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <p role="status">Завантаження…</p>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return (
    <>
      <NotificationCenter />
      <Outlet />
    </>
  );
}
