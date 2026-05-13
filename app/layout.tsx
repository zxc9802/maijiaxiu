import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '买家秀智能体',
  description: '运营草稿生成工具',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
