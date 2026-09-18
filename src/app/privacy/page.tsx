import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy — jevusecases",
  description: "What jevusecases records about visitors, and what it does not.",
};

const ISSUES_URL = "https://github.com/theSekyi/jevusecases/issues";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-bp-mono text-[11px] tracking-widest text-bp-secondary">{title}</h2>
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="flex flex-1 justify-center bg-bp-bg px-6 py-16 font-bp-sans text-bp-ink">
      <div className="flex w-full max-w-xl flex-col gap-10">
        <div className="flex flex-col gap-2">
          <span className="font-bp-mono text-[11px] tracking-widest text-bp-accent">PRIVACY</span>
          <h1 className="text-3xl font-bold">What this site records about you</h1>
          <p className="text-sm text-bp-secondary">
            Short version: it counts visits. It does not store your IP address, and it does not track you on other sites.
          </p>
        </div>

        <Section title="WHAT IT RECORDS">
          <p>For each page you open, the site records four things:</p>
          <ul className="list-disc pl-5">
            <li>the page you opened (for example /submit)</li>
            <li>your country, which the hosting platform works out from your IP address</li>
            <li>the time</li>
            <li>a one-way hash of your IP address</li>
          </ul>
        </Section>

        <Section title="WHAT IT DOES NOT RECORD">
          <p>
            It does not store your IP address, your name, your browser or device details, or what you do on other
            sites. It uses no advertising and no third-party analytics.
          </p>
        </Section>

        <Section title="THE HASH">
          <p>
            The hash is made from your IP address and a secret key that only the site owner has. Nobody can turn it back
            into your IP address. The same IP address always gives the same hash, so the site can tell that one visitor
            came back. It cannot tell who that visitor is.
          </p>
        </Section>

        <Section title="WHY">
          <p>
            To count unique and returning visitors, and to show country totals to the site owner. The live strip on the
            home page shows only a country and a page. It never shows a hash.
          </p>
        </Section>

        <Section title="COOKIES">
          <p>The site does not set cookies for visitors. Only the site owner&apos;s sign-in uses one.</p>
        </Section>

        <Section title="SUBMISSIONS">
          <p>
            When you submit a project, what you type (name, description, category, link and optional X handle) is sent
            to a public pull request on GitHub. Anyone can read it there. Do not put anything in it that you want to
            keep private.
          </p>
        </Section>

        <Section title="WHO HANDLES THE DATA">
          <p>
            Vercel hosts the site and works out your country. Neon stores the visit records. GitHub holds submissions.
            Records are kept until they are deleted. There is no automatic deletion yet.
          </p>
        </Section>

        <Section title="QUESTIONS OR REQUESTS">
          <p>
            <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-bp-accent">
              Open an issue on GitHub
            </a>
            . Do not post your IP address there. Ask for a private way to contact the owner instead.
          </p>
        </Section>
      </div>
    </main>
  );
}
