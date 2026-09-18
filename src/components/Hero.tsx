import type { ReactNode } from "react";

export function Hero({ search, live }: { search: ReactNode; live?: ReactNode }) {
  return (
    <section className="relative overflow-hidden border-b border-bp-hairline">
      <div aria-hidden="true" className="bp-dot-grid absolute inset-0" />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-6 pb-14 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-16 lg:pb-20 lg:pt-24">
        <div className="flex flex-col gap-7">
          <h1 className="max-w-3xl text-balance text-[clamp(2rem,4.6vw+0.5rem,3.75rem)] font-semibold leading-[1.04] tracking-[-0.03em]">
            What people replaced with Jev, and everything they&apos;re shipping with it.
          </h1>
          <p className="max-w-[52ch] text-base leading-relaxed text-bp-secondary sm:text-lg">
            Real projects, with the numbers to prove it. Open one to see how it was built.
          </p>
          {search}
          <p className="text-sm text-bp-secondary">
            Built something with Jev?{" "}
            <a
              href="/submit"
              className="font-semibold text-bp-accent underline decoration-bp-accent/40 underline-offset-4 transition-colors hover:decoration-bp-accent"
            >
              Submit your project
            </a>
          </p>
        </div>
        {live && <div className="hidden self-end lg:block">{live}</div>}
      </div>
    </section>
  );
}
