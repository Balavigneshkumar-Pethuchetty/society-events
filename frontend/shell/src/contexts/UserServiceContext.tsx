import React, {
  createContext, useCallback, useContext,
  useEffect, useState,
} from 'react';
import { useAuth } from './AuthContext';
import { userService, DbUser, Apartment } from '../api/userService';

interface UserServiceContextValue {
  dbUser: DbUser | null;
  apartments: Apartment[];
  isSyncing: boolean;
  syncError: string | null;
  refreshProfile: () => Promise<void>;
  updateProfile: (data: { name?: string; phone?: string }) => Promise<void>;
  assignApartment: (apartment_id: string) => Promise<void>;
}

const UserServiceContext = createContext<UserServiceContextValue | null>(null);

export function UserServiceProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const [dbUser,    setDbUser]    = useState<DbUser | null>(null);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [isSyncing,  setIsSyncing]  = useState(false);
  const [syncError,  setSyncError]  = useState<string | null>(null);

  // On every new login (user.sub changes) sync to DB and fetch apartments.
  useEffect(() => {
    if (!user || !token) {
      setDbUser(null);
      return;
    }
    setIsSyncing(true);
    setSyncError(null);
    Promise.all([
      userService.sync(token),
      userService.listApartments(token),
    ])
      .then(([synced, apts]) => {
        setDbUser(synced);
        setApartments(apts);
      })
      .catch((err: Error) => setSyncError(err.message))
      .finally(() => setIsSyncing(false));
  }, [user?.sub]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    const u = await userService.me(token);
    setDbUser(u);
  }, [token]);

  const updateProfile = useCallback(async (data: { name?: string; phone?: string }) => {
    if (!token) throw new Error('Not authenticated');
    const u = await userService.update(token, data);
    setDbUser(u);
  }, [token]);

  const assignApartment = useCallback(async (apartment_id: string) => {
    if (!token) throw new Error('Not authenticated');
    const u = await userService.assignApartment(token, apartment_id);
    setDbUser(u);
  }, [token]);

  return (
    <UserServiceContext.Provider
      value={{ dbUser, apartments, isSyncing, syncError, refreshProfile, updateProfile, assignApartment }}
    >
      {children}
    </UserServiceContext.Provider>
  );
}

export function useUserService(): UserServiceContextValue {
  const ctx = useContext(UserServiceContext);
  if (!ctx) throw new Error('useUserService must be used within <UserServiceProvider>');
  return ctx;
}
