import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Submit a project — jevusecases",
  description: "Tell us what you built with Jev.",
};

export default function SubmitLayout({ children }: LayoutProps<"/submit">) {
  return children;
}
