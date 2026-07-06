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
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/subjects", label: "Subjects", icon: BookOpen },
  { href: "/review", label: "Review", icon: RefreshCw },
  { href: "/quizzes", label: "Quizzes", icon: HelpCircle },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/upload", label: "AI Decks", icon: Sparkles },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/grades", label: "Grades", icon: GraduationCap },
  { href: "/settings", label: "Settings", icon: Settings },
];

// True when `pathname` should light up `href`. Dashboard is exact; the rest also match their
// nested routes (e.g. /subjects/abc highlights Subjects).
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
