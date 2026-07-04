import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  // Class strategy: a `dark` class on <html> flips the theme (see the no-flash script in
  // app/layout.tsx + ThemeToggle). Lets us honour system preference AND a manual choice.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Semantic surface/text/line tokens — the load-bearing part of theming. Each maps to a
        // CSS variable (RGB triple) defined per theme in globals.css, so ONE class (e.g.
        // `bg-surface`, `text-ink`, `border-line`) is correct in both light and dark, and alpha
        // modifiers still work (`bg-surface/80`). Components should reach for these, not raw grays.
        canvas: "rgb(var(--canvas) / <alpha-value>)", // page background
        surface: "rgb(var(--surface) / <alpha-value>)", // cards / raised panels
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)", // insets, subtle fills
        ink: "rgb(var(--ink) / <alpha-value>)", // primary text / headings
        "ink-2": "rgb(var(--ink-2) / <alpha-value>)", // secondary body text
        muted: "rgb(var(--muted) / <alpha-value>)", // tertiary text / captions
        subtle: "rgb(var(--subtle) / <alpha-value>)", // quaternary / decorative
        line: "rgb(var(--line) / <alpha-value>)", // hairline borders / tracks
        "line-strong": "rgb(var(--line-strong) / <alpha-value>)", // hover borders / dots
        // Brand — a confident electric violet ("iris"), full scale so tints/shades are reusable
        // tokens rather than ad-hoc per component. Tuned a touch bluer + more saturated than the
        // per-subject `violet` family (subjectColor.ts) so app chrome never reads as a subject
        // accent, and deliberately distinct from the semantic green/amber/red (grade quality,
        // exam urgency, card difficulty) so the accent never collides with meaning. Every pair
        // below was AA-checked: white on 600 ≈ 6.4:1, 600-on-white ≈ 6.4:1, 700-on-50 ≈ 7.5:1.
        brand: {
          50: "#f3f1ff",
          100: "#e9e4ff",
          200: "#d5ccff",
          300: "#b7a6ff",
          400: "#977bff",
          500: "#7c4dff",
          600: "#6a2ff0",
          700: "#591fd0",
          800: "#491ba8",
          900: "#3d1a83",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI Variable",
          "Segoe UI",
          "Inter",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        // Soft, layered card shadows on a cool ink (slate-900) base — quieter than Tailwind's
        // default black-based shadows.
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.05)",
        "card-hover": "0 8px 24px -6px rgb(15 23 42 / 0.12), 0 3px 8px -3px rgb(15 23 42 / 0.08)",
        // Tinted to the brand hue (violet-600 #6a2ff0 = rgb 106 47 240) so the primary CTA feels
        // lit rather than dropped on black.
        "brand-sm": "0 1px 2px 0 rgb(106 47 240 / 0.22), 0 2px 8px -2px rgb(106 47 240 / 0.28)",
        "brand-md": "0 10px 28px -8px rgb(106 47 240 / 0.42), 0 4px 12px -4px rgb(106 47 240 / 0.32)",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "none" },
        },
        // Staggered content entrance — pair with inline animation-delay for a cascade.
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "none" },
        },
        // Slow, organic drift for the login aurora. Transform/opacity only (GPU-friendly).
        aurora: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)", opacity: "0.85" },
          "50%": { transform: "translate3d(3%,-4%,0) scale(1.12)", opacity: "1" },
        },
        // Gentle vertical float for the decorative brand motif.
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        // Sweeping highlight for skeleton/placeholder shimmer.
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        rise: "rise 0.35s ease-out both",
        "fade-up": "fade-up 0.6s cubic-bezier(0.16,1,0.3,1) both",
        aurora: "aurora 14s ease-in-out infinite",
        "aurora-slow": "aurora 20s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
