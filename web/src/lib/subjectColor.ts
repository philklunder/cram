// Per-subject color identity. Each subject is deterministically mapped to one curated color
// family from its (stable) id, so the SAME subject wears the SAME accent everywhere it appears
// — its list card, its detail hero, its badges, its progress. The cobalt "brand" scale stays the
// app chrome (nav, primary buttons); these families are the *content* accent, kept clearly apart
// from the semantic green/amber/red used for grade quality and exam urgency.
//
// Colors are delivered as CSS custom properties (a `style` object), not Tailwind classes, because
// the family is chosen at runtime and Tailwind can't JIT dynamic class names. Components then read
// the vars through static arbitrary-value utilities (e.g. `text-[color:var(--sc-ink)]`,
// `bg-[var(--sc-soft)]`), which Tailwind keeps because the class strings are literal.

import type { CSSProperties } from "react";

export interface ColorFamily {
  /** Human name — handy for aria/debug, never shown as decoration. */
  name: string;
  /** Vivid accent for dots, rings, small fills (≈ Tailwind 500). */
  solid: string;
  /** Readable text tone on white or the soft tint (≈ 700). Contrast-checked ≥ 4.5:1 on both. */
  ink: string;
  /** Very light tinted surface (≈ 50). */
  soft: string;
  /** Slightly stronger tint for hairline borders on the soft surface (≈ 100). */
  line: string;
  /** Gradient stops for the hero / accent strip (≈ 400 → 600). */
  from: string;
  to: string;
  /** Space-separated RGB triple of `solid`, for `rgb(var(--sc-glow) / <a>)` glows. */
  glow: string;
}

// Ten families, spread around the wheel so adjacent hashes land on visibly different hues.
// Values are hand-picked from the Tailwind palette; `ink` is the 700 step, which clears WCAG AA
// (≥ 4.5:1) on both white and the family's own 50 tint.
const FAMILIES: readonly ColorFamily[] = [
  { name: "emerald", solid: "#10b981", ink: "#047857", soft: "#ecfdf5", line: "#d1fae5", from: "#34d399", to: "#059669", glow: "16 185 129" },
  { name: "sky",     solid: "#0ea5e9", ink: "#0369a1", soft: "#f0f9ff", line: "#e0f2fe", from: "#38bdf8", to: "#0284c7", glow: "14 165 233" },
  { name: "violet",  solid: "#8b5cf6", ink: "#6d28d9", soft: "#f5f3ff", line: "#ede9fe", from: "#a78bfa", to: "#7c3aed", glow: "139 92 246" },
  { name: "rose",    solid: "#f43f5e", ink: "#be123c", soft: "#fff1f2", line: "#ffe4e6", from: "#fb7185", to: "#e11d48", glow: "244 63 94" },
  { name: "amber",   solid: "#f59e0b", ink: "#b45309", soft: "#fffbeb", line: "#fef3c7", from: "#fbbf24", to: "#d97706", glow: "245 158 11" },
  { name: "teal",    solid: "#14b8a6", ink: "#0f766e", soft: "#f0fdfa", line: "#ccfbf1", from: "#2dd4bf", to: "#0d9488", glow: "20 184 166" },
  { name: "fuchsia", solid: "#d946ef", ink: "#a21caf", soft: "#fdf4ff", line: "#fae8ff", from: "#e879f9", to: "#c026d3", glow: "217 70 239" },
  { name: "indigo",  solid: "#6366f1", ink: "#4338ca", soft: "#eef2ff", line: "#e0e7ff", from: "#818cf8", to: "#4f46e5", glow: "99 102 241" },
  { name: "orange",  solid: "#f97316", ink: "#c2410c", soft: "#fff7ed", line: "#ffedd5", from: "#fb923c", to: "#ea580c", glow: "249 115 22" },
  { name: "cyan",    solid: "#06b6d4", ink: "#0e7490", soft: "#ecfeff", line: "#cffafe", from: "#22d3ee", to: "#0891b2", glow: "6 182 212" },
] as const;

// djb2 — small, stable, well-distributed for short strings. Bitwise ops keep it a 32-bit int.
function hash(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** The color family for a subject, keyed on its stable id (falls back to name). */
export function subjectFamily(seed: string): ColorFamily {
  return FAMILIES[hash(seed || "cram") % FAMILIES.length];
}

// CSS custom properties carry the `--sc-*` prefix; React's CSSProperties type doesn't know them,
// so the map is built loosely and cast once here.
type CssVars = CSSProperties & Record<`--sc-${string}`, string>;

/** Inline `style` object exposing a subject's family as `--sc-*` custom properties. */
export function subjectVars(seed: string): CssVars {
  const f = subjectFamily(seed);
  return {
    "--sc-solid": f.solid,
    "--sc-ink": f.ink,
    "--sc-soft": f.soft,
    "--sc-line": f.line,
    "--sc-from": f.from,
    "--sc-to": f.to,
    "--sc-glow": f.glow,
  } as CssVars;
}
