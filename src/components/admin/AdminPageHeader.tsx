import Link from "next/link";
import { ADMIN_PATH } from "@/lib/authConstants";

export function AdminPageHeader({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Link href={ADMIN_PATH} className="font-bp-mono text-[11px] tracking-widest text-bp-accent hover:underline">
        <span aria-hidden="true">←</span> <span className="sr-only">Back to</span> ADMIN
      </Link>
      <h1 className="text-3xl font-bold">{title}</h1>
    </div>
  );
}
