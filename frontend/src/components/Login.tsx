'use client';

import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';

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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-100/50 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-100/50 rounded-full blur-[120px]" />

      <div className="glass w-full max-w-md p-10 rounded-[2.5rem] border-white/60 shadow-2xl relative z-10 animate-in fade-in zoom-in duration-700">
        <div className="text-center mb-10">
          <div className="inline-block p-4 bg-white rounded-3xl shadow-xl mb-6 animate-float">
            <span className="text-5xl">👨‍👩‍👧‍👦</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight mb-2">
            Family <span className="gradient-text">Calendar</span>
          </h1>
          <p className="text-slate-500 font-medium">Chào mừng bạn quay trở lại với gia đình!</p>
        </div>

        <div className="space-y-6 flex flex-col items-center">
          {error && (
            <div className="w-full p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-bold border border-red-100 animate-shake">
              ⚠️ {error}
            </div>
          )}

          <div className="w-full flex justify-center py-4 bg-white/50 rounded-2xl border border-white/80 hover:bg-white transition-all duration-300">
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

          <p className="text-xs text-slate-400 text-center px-4 leading-relaxed">
            Bằng cách đăng nhập, bạn đồng ý với các điều khoản sử dụng dành riêng cho gia đình của chúng tôi.
          </p>
        </div>

        {isLoggingIn && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm rounded-[2.5rem] flex items-center justify-center z-20 animate-in fade-in duration-300">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-indigo-600 font-black">Nối lại yêu thương...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
