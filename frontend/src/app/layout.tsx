import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Otclick — авто-отклики hh",
  description: "Авто-отклики на hh.kz / hh.ru",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className="antialiased">
      <body>{children}</body>
    </html>
  );
}
