import { redirect } from "next/navigation";

export default async function MetaPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  redirect(`/orchestrators/${encodeURIComponent(name)}`);
}
