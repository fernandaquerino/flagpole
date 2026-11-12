import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Flagpole · Feature control',
  description: 'Your features. Your rollout. Self-hosted feature flags.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
