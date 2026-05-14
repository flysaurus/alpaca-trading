import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Alpaca Trading | Terminal",
  description: "Professional paper trading terminal",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Alpaca Trading",
    statusBarStyle: "black-translucent",
    startupImage: [
      { url: '/icon.svg', media: '(device-width: 390px) and (device-height: 844px)' },
    ],
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml', sizes: 'any' }],
    apple: [{ url: '/icon.svg', type: 'image/svg+xml', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var theme = localStorage.getItem('alpaca-trading-theme') || 'dark';
            document.documentElement.setAttribute('data-theme', theme);
          })();
        `}} />
      </head>
      <body className={`${inter.variable} ${mono.variable} bg-[var(--app-bg)] text-[var(--text-primary)] min-h-screen antialiased transition-colors duration-200`}>
        {children}
      </body>
    </html>
  );
}
