import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { LandingPage } from "@/components/landing/LandingPage";

// Self-hosted rather than loaded from fonts.googleapis.com: the CSP in next.config.mjs pins
// `font-src 'self'` and `style-src 'self'`, so the stylesheet link the original HTML used would
// be blocked. next/font inlines the @font-face and serves the files from our own origin.
const geist = Geist({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Cram — Study with less friction",
  description:
    "Cram turns your own study material into flashcards and quizzes, then adapts review around your grades and exam dates.",
};

export default function HomePage() {
  return <LandingPage fontClassName={geist.className} />;
}
