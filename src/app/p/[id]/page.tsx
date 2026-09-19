import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GeometricField } from "@/components/GeometricField";
import { ProjectExplorer } from "@/components/ProjectExplorer";
import { OpenProjectOnLoad } from "@/components/projects/OpenProjectOnLoad";
import { VisitorFeed } from "@/components/VisitorFeed";
import { getProjects } from "@/lib/projects";
import { projectUrl } from "@/lib/site";

// Each page renders on its first visit and is then cached. Prerendering all of them made every build
// write ~1,400 copies of the whole gallery. An id that is not an entry gets a 404 from notFound() below.
export function generateStaticParams() {
  return [];
}

function findProject(id: string) {
  return getProjects().find((project) => project.id === id);
}

export async function generateMetadata({ params }: PageProps<"/p/[id]">): Promise<Metadata> {
  const project = findProject((await params).id);
  if (!project) return {};
  const title = project.author ? `${project.project} by ${project.author}` : project.project;
  return {
    title: `${title} · jevusecases`,
    description: project.description,
    alternates: { canonical: projectUrl(project.id) },
    openGraph: { title, description: project.description, url: projectUrl(project.id) },
    twitter: { card: "summary_large_image", title, description: project.description },
  };
}

/**
 * The same gallery as the homepage, opened on one project. The page exists so a shared link has its own
 * preview card; once it loads, the panel takes over exactly as if the project had been clicked.
 */
export default async function ProjectPage({ params }: PageProps<"/p/[id]">) {
  const project = findProject((await params).id);
  if (!project) notFound();
  return (
    <main className="flex flex-1 flex-col">
      <GeometricField />
      <ProjectExplorer projects={getProjects()} live={<VisitorFeed />} />
      <OpenProjectOnLoad id={project.id} />
    </main>
  );
}
