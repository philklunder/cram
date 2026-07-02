import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand — a confident cobalt/azure, full scale so tints/shades are reusable tokens
        // rather than ad-hoc per component. Deliberately distinct from the app's semantic
        // green/amber/red (grade quality, exam urgency, card difficulty) so the accent never
        // collides with meaning.
        brand: {
          50: "#eff4ff",
          100: "#dbe6fe",
          200: "#bfd3fe",
          300: "#93b4fd",
          400: "#6090fa",
          500: "#3b6cf6",
          600: "#2a54e8",
          700: "#2343c7",
          800: "#223aa1",
          900: "#21357f",
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
        // Tinted to the brand hue so the primary CTA feels lit rather than dropped on black.
        "brand-sm": "0 1px 2px 0 rgb(42 84 232 / 0.20), 0 2px 8px -2px rgb(42 84 232 / 0.25)",
        "brand-md": "0 8px 24px -6px rgb(42 84 232 / 0.35), 0 4px 10px -4px rgb(42 84 232 / 0.28)",
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
