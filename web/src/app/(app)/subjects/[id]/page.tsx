import { SubjectDetail } from "@/components/SubjectDetail";

// In Next 15 route params are async.
export default async function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubjectDetail id={id} />;
}
