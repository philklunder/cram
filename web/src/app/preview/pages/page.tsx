// DEV-ONLY preview of the routed sidebar destinations inside the app shell, with mock library data.
// Server wrapper: reads the active page from ?p=<slug> so it renders on the first (server) paint —
// headless screenshots then capture the right surface without waiting for a client effect. Gated to
// non-production. Pick a page with ?p=<slug> (see PAGES in PagesPreviewClient); ?scale=<scale>
// forces the display grading scale.
import { notFound } from "next/navigation";

import { PagesPreviewClient } from "./PagesPreviewClient";

export default async function PagesPreview({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; scale?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { p, scale } = await searchParams;
  return <PagesPreviewClient slug={p ?? "review"} scale={scale} />;
}
