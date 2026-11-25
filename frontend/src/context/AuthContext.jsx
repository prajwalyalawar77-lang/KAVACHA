import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { TOKEN_KEY, USER_KEY, UNAUTHORIZED_EVENT, getToken, setToken } from '../services/api';

const AuthContext = createContext(null);

function cachedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(cachedUser);
  const [capabilities, setCapabilities] = useState(null);
  const [ready, setReady] = useState(false);

  const persistUser = useCallback((nextUser) => {
    setUser(nextUser);
    if (nextUser) localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    else localStorage.removeItem(USER_KEY);
  }, []);

  const clearSession = useCallback(() => {
    setToken(null);
    persistUser(null);
    setCapabilities(null);
  }, [persistUser]);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      clearSession();
      setReady(true);
      return null;
    }
    try {
      const { data } = await api.get('/auth/me');
      persistUser(data.user);
      setCapabilities(data.capabilities);
      return data.user;
    } catch (error) {
      if (error.status === 401) clearSession();
      return null;
    } finally {
      setReady(true);
    }
  }, [clearSession, persistUser]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => clearSession();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [clearSession]);

  const login = useCallback(
    async (email, password) => {
      const { data } = await api.post('/auth/login', { email, password });
      setToken(data.token);
      persistUser(data.user);
      await refresh();
      return data.user;
    },
    [persistUser, refresh],
  );

  const register = useCallback(
    async (payload) => {
      const { data } = await api.post('/auth/register', payload);
      setToken(data.token);
      persistUser(data.user);
      await refresh();
      return data.user;
    },
    [persistUser, refresh],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* token is discarded regardless */
    }
    clearSession();
  }, [clearSession]);

  const updateProfile = useCallback(
    async (payload) => {
      const { data } = await api.patch('/auth/me', payload);
      persistUser(data.user);
      return data.user;
    },
    [persistUser],
  );

  const selectRole = useCallback(
    async (payload) => {
      const { data } = await api.post('/auth/role', payload);
      persistUser(data.user);
      await refresh();
      return data.user;
    },
    [persistUser, refresh],
  );

  const value = useMemo(
    () => ({
      user,
      capabilities,
      ready,
      isAuthenticated: Boolean(user) && Boolean(getToken()),
      login,
      register,
      logout,
      refresh,
      updateProfile,
      selectRole,
      setUser: persistUser,
    }),
    [user, capabilities, ready, login, register, logout, refresh, updateProfile, selectRole, persistUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export { TOKEN_KEY };
