import type { Metadata } from 'next';
import './globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';

export const metadata: Metadata = {
  title: 'RICSE — 区域产业链服务生态',
  description: '运营管理平台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="font-sans">
      <body className="min-h-screen bg-background font-sans antialiased">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
