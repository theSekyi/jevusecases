import { getProjects } from "@/lib/projects";
import { SHARE_CARD_SIZE, shareCard } from "@/lib/shareCard";

export const alt = "jevusecases: what people are shipping with Jev";
export const size = SHARE_CARD_SIZE;
export const contentType = "image/png";

export default function Image() {
  return shareCard({
    eyebrow: "Built with Jev",
    title: "What people replaced with Jev, and what they ship with it",
    body: `${getProjects().length} real projects, with the numbers their builders reported and the code to copy.`,
    footerRight: "jevusecases.com",
  });
}
