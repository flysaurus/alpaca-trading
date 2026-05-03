import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import PwaRegister from "@/components/PwaRegister";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Kilimanjaro Training Dashboard",
  description: "Track your fitness journey to the summit of Kilimanjaro",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Kili Dash",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#f59e0b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50 min-h-screen`}>
        <PwaRegister />
        <Nav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
