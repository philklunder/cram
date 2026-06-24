import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Cram — Study Desk",
  description: "Upload material, browse your decks, and track exam progress.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
