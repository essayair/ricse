import type { Metadata } from 'next';
import './globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SystemDialogProvider } from '@/components/system-dialog-provider';

export const metadata: Metadata = {
  title: 'RICSE — 和光云链区域产业链服务生态',
  description: '运营管理平台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="font-sans">
      <body className="min-h-screen bg-background font-sans antialiased">
        <TooltipProvider><SystemDialogProvider>{children}</SystemDialogProvider></TooltipProvider>
      </body>
    </html>
  );
}
