// Shared design-system primitives. One source of truth for buttons, badges, surfaces, form
// fields, and the empty/loading/error states so the app reads as one coherent system.

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

// Tiny class combiner — joins truthy parts. Avoids a clsx dependency for this small surface.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// --- Brand mark ------------------------------------------------------------------------

export function BrandMark({ size = 32 }: { size?: number }) {
  // The Cram app icon (calendar + flashcards). The PNG carries its own squircle shape and
  // transparent corners, so no background or rounding is applied here.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/cram-logo.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className="select-none"
      style={{ width: size, height: size }}
    />
  );
}

// --- Button ----------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98] disabled:active:scale-100";

const buttonVariants: Record<ButtonVariant, string> = {
  // Subtle top-lit gradient + a brand-tinted glow so the primary action feels raised, not painted on.
  // The cobalt gradient reads well on both light and dark canvases, so it needs no dark override.
  primary:
    "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-brand-sm hover:from-brand-600 hover:to-brand-700 hover:shadow-brand-md active:from-brand-700 active:to-brand-800",
  secondary:
    "border border-line bg-surface text-ink-2 shadow-sm hover:border-brand-200 hover:bg-brand-50/40 hover:text-brand-700 hover:-translate-y-px hover:shadow-card dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10 dark:hover:text-brand-200",
  ghost:
    "text-ink-2 hover:bg-brand-50/60 hover:text-brand-700 dark:hover:bg-brand-500/15 dark:hover:text-brand-200",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "px-3.5 py-1.5 text-sm",
  md: "px-4 py-2.5 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/40 border-t-current"
        />
      ) : null}
      {children}
    </button>
  );
}

// --- Form fields -----------------------------------------------------------------------

export const labelClass = "block text-sm font-medium text-ink-2";
export const inputClass =
  "mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink shadow-sm transition duration-200 placeholder:text-subtle hover:border-line-strong focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/15";
// Native <select> styled to match inputClass. The platform arrow is hidden via appearance-none so
// callers can overlay a matching chevron (see SelectField); `pr-10` reserves room for it.
export const selectClass = cn(inputClass, "cursor-pointer appearance-none pr-10");

// --- Spinner / loaders -----------------------------------------------------------------

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand-600 dark:border-t-brand-400" />
      {label ?? "Loading…"}
    </div>
  );
}

// Centered loader for full-section loading states.
export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[38vh] items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}

// --- Skeletons -------------------------------------------------------------------------

// A shimmering placeholder block that matches the shape of the content it stands in for. The
// sweep is a masked highlight (transform/opacity only) so it stays cheap; it collapses to a
// still tint under prefers-reduced-motion via the global clamp in globals.css.
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-lg bg-line/70",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer",
        "after:bg-gradient-to-r after:from-transparent after:via-white/60 after:to-transparent dark:after:via-white/10",
        className,
      )}
    />
  );
}

// --- Badge -----------------------------------------------------------------------------

type Tone = "neutral" | "brand" | "green" | "amber" | "red";

const toneClasses: Record<Tone, string> = {
  // In dark mode the light -50 fills become bright patches, so each tone flips to a translucent
  // tint of its own hue with a lighter -300 text — keeps meaning + clears contrast on dark surfaces.
  neutral: "bg-gray-100 text-gray-700 ring-gray-500/15 dark:bg-white/10 dark:text-ink-2 dark:ring-white/10",
  brand: "bg-brand-50 text-brand-700 ring-brand-600/15 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-400/20",
  green: "bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-400/25",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25",
  red: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-400/25",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}

// --- Surfaces --------------------------------------------------------------------------

export function Panel({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cn(
        // A calm, static container. Elevation is carried by the crisp hairline + subtle shadow,
        // not by hover motion — interactive surfaces add their own affordances on top.
        "rounded-xl border border-line bg-surface p-5 shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

// --- Feedback states -------------------------------------------------------------------

export function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
    >
      <svg
        className="mt-0.5 h-4 w-4 flex-none text-red-500 dark:text-red-400"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 012 0v4a1 1 0 11-2 0V9zm1-5a1 1 0 100 2 1 1 0 000-2z"
          clipRule="evenodd"
        />
      </svg>
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong/80 bg-surface/50 px-6 py-14 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-500 ring-1 ring-inset ring-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/20">
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path d="M4 4a2 2 0 012-2h5.586A2 2 0 0113 2.586L16.414 6A2 2 0 0117 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

// --- Misc helpers ----------------------------------------------------------------------

export function difficultyTone(difficulty: number): Tone {
  if (difficulty <= 2) return "green";
  if (difficulty === 3) return "amber";
  return "red";
}
