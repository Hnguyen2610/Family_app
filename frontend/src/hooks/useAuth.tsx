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
  families?: {
    id: string;
    name: string;
  }[];
  family?: {
    id: string;
    name: string;
  } | null;
  notificationSettings?: any;
}

interface AuthContextType {
  user: User | null;
  currentFamilyId: string | null;
  setCurrentFamilyId: (id: string | null) => void;
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
  const [currentFamilyId, setCurrentFamilyIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setCurrentFamilyId = useCallback((id: string | null) => {
    setCurrentFamilyIdState(id);
    if (id) {
      localStorage.setItem('family_id', id);
    } else {
      localStorage.removeItem('family_id');
    }
  }, []);

  const login = useCallback(async (token: string) => {
    try {
      const response = await authAPI.loginWithGoogle(token);
      const { user: userData, accessToken } = response.data;
      
      setUser(userData);
      localStorage.setItem('family_user', JSON.stringify(userData));
      
      // Handle multi-family selection logic
      const savedFamilyId = localStorage.getItem('family_id');
      const families = userData.families || [];
      const hasSavedFamily = families.some((f: any) => f.id === savedFamilyId);
      
      const targetFamilyId = hasSavedFamily ? savedFamilyId : (families[0]?.id || userData.familyId || null);
      setCurrentFamilyId(targetFamilyId);
      
      localStorage.setItem('family_token', accessToken);
      
      return userData;
    } catch (error) {
      console.error('AuthProvider: Login failed', error);
      throw error;
    }
  }, [setCurrentFamilyId]);

  const logout = useCallback(() => {
    setUser(null);
    setCurrentFamilyId(null);
    localStorage.removeItem('family_user');
    localStorage.removeItem('family_id');
    localStorage.removeItem('family_token');
  }, [setCurrentFamilyId]);

  const refreshUser = useCallback(async () => {
    try {
      const response = await authAPI.getProfile();
      const userData = response.data;
      setUser(userData);
      localStorage.setItem('family_user', JSON.stringify(userData));
      
      const savedFamilyId = localStorage.getItem('family_id');
      const families = userData.families || [];
      if (savedFamilyId && !families.some((f: any) => f.id === savedFamilyId)) {
          // If saved ID is no longer valid, fallback to first
           setCurrentFamilyId(families[0]?.id || userData.familyId || null);
      } else if (!savedFamilyId && (families.length > 0 || userData.familyId)) {
           setCurrentFamilyId(families[0]?.id || userData.familyId || null);
      }
    } catch (error) {
      console.error('AuthProvider: Refresh failed', error);
    }
  }, [setCurrentFamilyId]);

  useEffect(() => {
    const savedUser = localStorage.getItem('family_user');
    const savedFamilyId = localStorage.getItem('family_id');
    const token = localStorage.getItem('family_token');
    
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        if (savedFamilyId) {
            setCurrentFamilyIdState(savedFamilyId);
        } else if (parsedUser.families?.length > 0) {
            setCurrentFamilyId(parsedUser.families[0].id);
        } else if (parsedUser.familyId) {
            setCurrentFamilyId(parsedUser.familyId);
        }
      } catch (e) {
        console.error('Failed to parse saved user:', e);
        localStorage.removeItem('family_user');
      }
    }
    
    setIsLoading(false);
    
    if (token) {
      refreshUser();
    }
  }, [setCurrentFamilyId, refreshUser]);

  const contextValue = React.useMemo(() => ({
    user,
    currentFamilyId,
    setCurrentFamilyId,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshUser,
    setUser
  }), [user, currentFamilyId, setCurrentFamilyId, isLoading, login, logout, refreshUser]);

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
