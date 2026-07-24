'use client';

import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';

import MascotAvatar from '@/components/MascotAvatar';

export default function Login() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleSuccess = async (response: any) => {
    setIsLoggingIn(true);
    setError(null);
    try {
      await login(response.credential);
      setIsLoggingIn(false);
    } catch (err: any) {
      console.error('Login error in component:', err);
      const message = err.response?.data?.message || 'Đăng nhập thất bại. Vui lòng thử lại.';
      setError(message);
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex justify-center pt-2">
            <MascotAvatar
              size="lg"
              isWaving={true}
              showBubble={true}
              bubbleText="Xin chào! Đăng nhập để cùng quản lý gia đình nhé 👋"
              bubblePosition="top"
            />
          </div>
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-950">
            Family <span className="gradient-text">Calendar</span>
          </h1>
          <p className="text-sm font-medium text-slate-500">Chào mừng bạn quay lại với gia đình.</p>
        </div>

        <div className="flex flex-col items-center space-y-6">
          {error && (
            <div className="w-full rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-600">
              ⚠️ {error}
            </div>
          )}

          <div className="flex w-full justify-center rounded-xl border border-slate-200 bg-slate-50 py-4 transition-colors hover:bg-white">
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={() => setError('Không thể kết nối với Google.')}
              useOneTap
              theme="outline"
              size="large"
              shape="pill"
              text="signin_with"
            />
          </div>

          <p className="px-4 text-center text-xs leading-relaxed text-slate-400">
            Bằng cách đăng nhập, bạn đồng ý sử dụng Family Calendar để quản lý dữ liệu gia đình của mình.
          </p>
        </div>

        {isLoggingIn && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/90">
            <div className="flex flex-col items-center">
              <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
              <p className="font-semibold text-indigo-600">Đang đăng nhập...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
