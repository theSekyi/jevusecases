import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Deliberately no auth check here: layouts don't re-run on client navigation, so every admin page
// and Server Action calls requireAdmin() itself.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
