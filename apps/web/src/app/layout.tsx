import type { Metadata } from 'next';
import './globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SystemDialogProvider } from '@/components/system-dialog-provider';

export const metadata: Metadata = {
  title: 'RICSE — 和光云链区域产业链服务生态',
  description: '运营管理平台',
  icons: {
    icon: [
      { url: '/favicon.ico?v=20261118', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
      { url: '/brand/favicon-32.png?v=20261118', sizes: '32x32', type: 'image/png' },
      { url: '/brand/favicon-192.png?v=20261118', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/brand/apple-touch-icon.png?v=20261118', sizes: '180x180', type: 'image/png' }],
  },
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
