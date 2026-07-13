import {
  BarChart3,
  BookOpen,
  CalendarDays,
  GraduationCap,
  HelpCircle,
  Home,
  Layers,
  RefreshCw,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

// The primary app destinations, in sidebar order. One source of truth so the sidebar and any
// future command palette stay in sync. `href` is matched against the current pathname for the
// active state (exact for /dashboard, prefix for the rest so nested routes stay highlighted).
//
// Ten flat items made Review, Quizzes, Flashcards and AI Decks read as four unranked doors into
// the same activity. Grouping them means the rail is scannable in one pass: what you *do*, what
// you *own*, what you *learn from*. Dashboard and Settings sit outside any group — one is the
// way in, the other the way out.
export type NavGroup = "study" | "library" | "insights";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group?: NavGroup;
  /** Renders a live count badge (currently only cards due on Review). */
  badge?: "due";
}

export const GROUP_LABEL: Record<NavGroup, string> = {
  study: "Study",
  library: "Library",
  insights: "Insights",
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },

  { href: "/review", label: "Review", icon: RefreshCw, group: "study", badge: "due" },
  { href: "/quizzes", label: "Quizzes", icon: HelpCircle, group: "study" },
  { href: "/flashcards", label: "Flashcards", icon: Layers, group: "study" },

  { href: "/subjects", label: "Subjects", icon: BookOpen, group: "library" },
  { href: "/upload", label: "AI Decks", icon: Sparkles, group: "library" },

  { href: "/calendar", label: "Calendar", icon: CalendarDays, group: "insights" },
  { href: "/progress", label: "Progress", icon: BarChart3, group: "insights" },
  { href: "/grades", label: "Grades", icon: GraduationCap, group: "insights" },

  { href: "/settings", label: "Settings", icon: Settings },
];

// The nav in render order: leading ungrouped items, then each group, then trailing ungrouped
// items (Settings), which the sidebar pins to the bottom.
export const NAV_GROUPS: NavGroup[] = ["study", "library", "insights"];
export const NAV_LEAD = NAV_ITEMS.filter((i) => !i.group && i.href === "/dashboard");
export const NAV_TAIL = NAV_ITEMS.filter((i) => !i.group && i.href === "/settings");
export const navItemsIn = (group: NavGroup): NavItem[] => NAV_ITEMS.filter((i) => i.group === group);

// True when `pathname` should light up `href`. Dashboard is exact; the rest also match their
// nested routes (e.g. /subjects/abc highlights Subjects).
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
