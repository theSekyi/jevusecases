import { GeometricField } from "@/components/GeometricField";
import { ProjectCatalogue } from "@/components/ProjectCatalogue";
import { VisitorFeed } from "@/components/VisitorFeed";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <GeometricField />
      <ProjectCatalogue live={<VisitorFeed />} />
    </main>
  );
}
