
import type {Metadata} from 'next';
import {Geist, Geist_Mono} from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from "@/components/ui/toaster";
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Family Fund Tracker',
  description: 'Manage your family savings and emergency funds.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <AuthProvider>
              {children}
              <Toaster />
            </AuthProvider>
            {/* <ReactQueryDevtools initialIsOpen={false} /> */}
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
