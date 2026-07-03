import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Cram — Study Desk",
  description: "Upload material, browse your decks, and track exam progress.",
};

// Runs before first paint to set the theme class, so there's no light-to-dark flash on load.
// Honours an explicit saved choice ("cram-theme"), else the OS preference. Kept tiny + inline;
// the matching React state lives in ThemeToggle. suppressHydrationWarning on <html> because this
// script mutates the class the server didn't render.
const noFlashTheme = `(function(){try{var t=localStorage.getItem('cram-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
