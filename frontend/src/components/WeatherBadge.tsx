'use client';

import { useEffect, useMemo, useState } from 'react';
import { FiCloud, FiCloudRain, FiSun, FiWind } from 'react-icons/fi';
import { weatherAPI, WeatherSummary } from '@/lib/api-client';

type WeatherBadgeProps = {
  variant?: 'full' | 'compact';
};

export default function WeatherBadge({ variant = 'compact' }: WeatherBadgeProps) {
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    weatherAPI.getSummary()
      .then((response) => {
        if (!cancelled) {
          setWeather(response.data);
          setHasError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWeather(null);
          setHasError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const icon = useMemo(() => {
    const condition = weather?.current?.condition?.toLowerCase() || '';
    if (/rain|mưa|drizzle|shower|storm|thunder/.test(condition)) return <FiCloudRain />;
    if (/sun|clear|nắng/.test(condition)) return <FiSun />;
    if (/wind|gió/.test(condition)) return <FiWind />;
    return <FiCloud />;
  }, [weather?.current?.condition]);

  if (isLoading) {
    return (
      <div className="h-9 w-16 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 border border-black/5 dark:border-white/10 animate-pulse" />
    );
  }

  const isAvailable = !!weather?.available && !!weather.current;
  const current = weather?.current;
  const tomorrow = weather?.tomorrow;
  const temp = isAvailable && current ? Math.round(current.tempC).toString() : '--';
  const rain = tomorrow?.chanceOfRain ?? 0;
  const showFull = variant === 'full';
  const location = weather?.location || 'Ha Noi';
  const condition = isAvailable
    ? current!.condition
    : hasError
      ? 'Không tải được thời tiết'
      : 'Chưa cấu hình thời tiết';

  return (
    <div
      className={`group relative flex items-center gap-2 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 px-3 py-2 shadow-sm backdrop-blur-md ${
        isAvailable ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'
      }`}
      title={`${location}: ${condition}`}
    >
      <span className="text-primary">{icon}</span>
      <div className="leading-none">
        <div className="flex items-center gap-1 text-xs font-black">
          <span>{temp}°C</span>
          {showFull && <span className="hidden lg:inline text-slate-400">/</span>}
          {showFull && <span className="hidden lg:inline">{location}</span>}
        </div>
        {showFull && (
          <p className="hidden lg:block mt-1 max-w-28 truncate text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            {condition}
          </p>
        )}
      </div>

      <div className="pointer-events-none absolute right-0 top-full z-[350] mt-2 w-64 rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-slate-950 p-4 text-xs text-slate-600 dark:text-slate-300 opacity-0 shadow-2xl transition-opacity group-hover:opacity-100">
        <div className="font-black text-slate-900 dark:text-white">{location}</div>
        <div className="mt-2 space-y-1 font-semibold">
          {!isAvailable && (
            <p>{condition}. Hãy kiểm tra backend đã restart và env WeatherAPI đã có trên môi trường đang chạy.</p>
          )}
          {isAvailable && (
            <>
              <p>Hiện tại: {current!.condition}, cảm giác {Math.round(current!.feelsLikeC)}°C</p>
              <p>Độ ẩm {current!.humidity}%, gió {Math.round(current!.windKph)} km/h</p>
            </>
          )}
          {tomorrow && (
            <p>Ngày mai: {tomorrow.condition}, mưa {rain}%, {Math.round(tomorrow.minTempC)}-{Math.round(tomorrow.maxTempC)}°C</p>
          )}
        </div>
      </div>
    </div>
  );
}
