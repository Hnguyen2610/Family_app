'use client';

import { GoogleOAuthProvider } from '@react-oauth/google';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/hooks/useAuth';

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <AuthProvider>
        {children}
        <Toaster position="top-right" />
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
