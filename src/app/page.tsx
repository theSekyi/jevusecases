import { Hero } from "@/components/Hero";
import { ProjectGrid } from "@/components/ProjectGrid";
import { VisitorFeed } from "@/components/VisitorFeed";
import { getProjects } from "@/lib/projects";

export default function Home() {
  const projects = getProjects();

  return (
    <main className="flex flex-1 flex-col">
      <Hero projects={projects} />
      <VisitorFeed />
      <ProjectGrid projects={projects} />
    </main>
  );
}
