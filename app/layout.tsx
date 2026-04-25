import type { Metadata } from 'next';
import './globals.css';
import { WriteTokenProvider } from '@/components/WriteTokenGate';

export const metadata: Metadata = {
  title: 'Cookbook Search',
  description: 'AI-powered recipe search across your cookbook collection',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WriteTokenProvider>{children}</WriteTokenProvider>
      </body>
    </html>
  );
}
