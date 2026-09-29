import { getProjects } from "@/lib/projects";
import { projectFacts } from "@/lib/projectFacts";
import { SHARE_CARD_SIZE, shareCard } from "@/lib/shareCard";

export const alt = "A project built with Jev, on jevusecases";
export const size = SHARE_CARD_SIZE;
export const contentType = "image/png";

// Rendered on first request and then cached, like the page itself.
export function generateStaticParams() {
  return [];
}

/** Leads with the project's strongest number, because a number is what makes a card worth opening. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProjects().find((entry) => entry.id === id);
  if (!project) return new Response("Not found", { status: 404 });
  const facts = projectFacts(project);
  const fact = facts.find((entry) => /\d/.test(entry.value)) ?? facts[0];
  return shareCard({
    eyebrow: project.category,
    title: project.project,
    highlight: fact ? { label: fact.label, value: fact.value } : undefined,
    body: project.description,
    footerLeft: project.author ? `by ${project.author}` : undefined,
    footerRight: "Built with Jev",
  });
}
