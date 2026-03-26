'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '@/lib/api-client';

export interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
  globalRole?: string;
  avatarUrl?: string;
  familyId?: string | null;
  family?: {
    id: string;
    name: string;
  } | null;
  notificationSettings?: any;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const login = useCallback(async (token: string) => {
    try {
      const response = await authAPI.loginWithGoogle(token);
      const { user: userData, accessToken } = response.data;
      
      setUser(userData);
      localStorage.setItem('family_user', JSON.stringify(userData));
      if (userData.familyId) {
        localStorage.setItem('family_id', userData.familyId);
      } else {
        localStorage.removeItem('family_id');
      }
      localStorage.setItem('family_token', accessToken);
      
      return userData;
    } catch (error) {
      console.error('AuthProvider: Login failed', error);
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('family_user');
    localStorage.removeItem('family_id');
    localStorage.removeItem('family_token');
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const response = await authAPI.getProfile();
      const userData = response.data;
      setUser(userData);
      localStorage.setItem('family_user', JSON.stringify(userData));
      if (userData.familyId) {
        localStorage.setItem('family_id', userData.familyId);
      }
    } catch (error) {
      console.error('AuthProvider: Refresh failed', error);
    }
  }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem('family_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error('Failed to parse saved user:', e);
        localStorage.removeItem('family_user');
      }
    }
    setIsLoading(false);
  }, []);

  const contextValue = React.useMemo(() => ({
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshUser,
    setUser
  }), [user, isLoading, login, logout, refreshUser]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
