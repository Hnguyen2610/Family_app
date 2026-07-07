import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-jakarta',
});

export const viewport: Viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: 'Family Hub',
  description: 'AI-Powered Family Management System',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning className="dark">
      <body className={`${jakarta.variable} font-sans antialiased text-[15px] tracking-tight tech-grid min-h-screen`}>
        <Providers>
          <main className="min-h-screen transition-colors duration-500">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
