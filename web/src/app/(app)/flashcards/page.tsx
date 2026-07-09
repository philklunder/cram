import { FlashcardsHubPage, type FlashcardsScope } from "@/components/pages/FlashcardsHub";

// The Subject page deep-links here with a practice scope in the query string (see lib/studyLink.ts).
// Keying the hub on that scope remounts it on each such navigation, so arriving from a different
// "Study" button always re-seeds the filters and can auto-open a practice session.
export default async function FlashcardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const scope: FlashcardsScope = {
    subjectId: one(params.subject),
    examScope: one(params.exam),
    dueOnly: one(params.due) === "1",
    autoStart: one(params.start) === "1",
  };

  const key = `${scope.subjectId ?? ""}|${scope.examScope ?? ""}|${scope.dueOnly}|${scope.autoStart}`;
  return <FlashcardsHubPage key={key} scope={scope} />;
}
