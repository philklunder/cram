"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

// Route transition for the app section. `template.tsx` re-mounts on every in-section navigation,
// so the page content gets a brief, calm enter (fade + small lift) that confirms the view changed
// without making the user wait on choreography. Kept to the product motion budget (~260ms, one
// eased move). Renders children untouched under reduced motion, so nothing ever animates — and the
// resting state is the visible one.
export default function AppTemplate({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
