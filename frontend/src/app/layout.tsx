import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';

const outfit = Outfit({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Family Calendar + AI Assistant',
  description: 'Calendar, meal planning, and AI chatbot for families',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.className} bg-[#f8fafc] text-slate-900 antialiased selection:bg-indigo-100 selection:text-indigo-900`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
