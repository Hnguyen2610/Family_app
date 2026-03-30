import type { Metadata } from 'next';
import { Quicksand } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';

const quicksand = Quicksand({ subsets: ['latin', 'vietnamese'] });

import { Viewport } from 'next';

export const viewport: Viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: 'Family Calendar + AI Assistant',
  description: 'Calendar, meal planning, and AI chatbot for families',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FamCal',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${quicksand.className} bg-[#f8fafc] text-slate-900 antialiased selection:bg-indigo-100 selection:text-indigo-900`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
