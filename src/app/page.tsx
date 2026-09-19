import { GeometricField } from "@/components/GeometricField";
import { ProjectExplorer } from "@/components/ProjectExplorer";
import { VisitorFeed } from "@/components/VisitorFeed";
import { getProjects } from "@/lib/projects";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <GeometricField />
      <ProjectExplorer projects={getProjects()} live={<VisitorFeed />} />
    </main>
  );
}
