import { Hero } from "@/components/Hero";
import { ProjectGrid } from "@/components/ProjectGrid";
import { getProjects } from "@/lib/projects";

export default function Home() {
  const projects = getProjects();

  return (
    <div className="flex flex-1 flex-col">
      <Hero projects={projects} />
      <ProjectGrid projects={projects} />
    </div>
  );
}
