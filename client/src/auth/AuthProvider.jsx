import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentUser, loginUser } from '../api/apiClient';
import { AuthContext } from './AuthContext';

const TOKEN_KEY = 'ecommerce_token';
const USER_KEY = 'ecommerce_user';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load stored session on app startup
  useEffect(() => {
    async function loadSession() {
      try {
        const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
        const storedUser = await AsyncStorage.getItem(USER_KEY);
        if (storedToken) setToken(storedToken);
        if (storedUser) setUser(JSON.parse(storedUser));
      } catch {
        // ignore read errors
      } finally {
        setLoading(false);
      }
    }
    loadSession();
  }, []);

  const login = useCallback(async (credentials) => {
    const response = await loginUser(credentials);
    await AsyncStorage.setItem(TOKEN_KEY, response.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(response.user));
    setToken(response.token);
    setUser(response.user);
    return response;
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    if (!token) return null;
    const response = await getCurrentUser(token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(response.user));
    setUser(response.user);
    return response.user;
  }, [token]);

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      isAuthenticated: Boolean(token),
      login,
      logout,
      refreshCurrentUser,
    }),
    [token, user, loading, login, logout, refreshCurrentUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
