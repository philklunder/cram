// Shared design-system primitives. One source of truth for buttons, badges, surfaces, form
// fields, and the empty/loading/error states so the app reads as one coherent system.

import type { ButtonHTMLAttributes, ReactNode } from "react";

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
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800",
  secondary: "border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50",
  ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
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

export const labelClass = "block text-sm font-medium text-gray-700";
export const inputClass =
  "mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40";

// --- Spinner / loaders -----------------------------------------------------------------

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-gray-500" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-brand-600" />
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

// --- Badge -----------------------------------------------------------------------------

type Tone = "neutral" | "brand" | "green" | "amber" | "red";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-gray-100 text-gray-700 ring-gray-500/15",
  brand: "bg-brand-50 text-brand-700 ring-brand-600/15",
  green: "bg-green-50 text-green-700 ring-green-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/25",
  red: "bg-red-50 text-red-700 ring-red-600/20",
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

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-gray-200/80 bg-white p-5 shadow-card", className)}>
      {children}
    </div>
  );
}

// --- Feedback states -------------------------------------------------------------------

export function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <svg
        className="mt-0.5 h-4 w-4 flex-none text-red-500"
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
    <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 px-6 py-12 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path d="M4 4a2 2 0 012-2h5.586A2 2 0 0113 2.586L16.414 6A2 2 0 0117 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">{hint}</p> : null}
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
