import { notFound } from "next/navigation";
import type { Section } from "@/components/app-shell";
import { PageRouter } from "@/components/page-router";

const sections: Section[] = ["workspace", "financials", "valuation", "thesis", "chat", "report", "settings"];

export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.includes(section as Section)) notFound();
  return <PageRouter section={section as Section} />;
}
