import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Autoclicker hh",
  description: "Авто-отклики на hh.kz / hh.ru",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full bg-white text-black">{children}</body>
    </html>
  );
}
