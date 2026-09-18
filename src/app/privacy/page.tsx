import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy — jevusecases",
  description: "What jevusecases records about visitors, and what it does not.",
};

const CONTACT_EMAIL = "privacy@jevusecases.com";

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
            Short version: it counts visits. It does not keep your IP address in its database, and it does not track you
            on other sites.
          </p>
        </div>

        <Section title="WHAT IT RECORDS">
          <p>For each page you open, the site records:</p>
          <ul className="list-disc pl-5">
            <li>the page you opened, as typed in the address, including pages that do not exist</li>
            <li>your country, when the hosting platform can work it out from your IP address</li>
            <li>the time</li>
            <li>a one-way hash of your IP address, when one can be made</li>
          </ul>
          <p>
            The home page shows the country and page of recent visits to everyone for about three minutes. It never
            shows a hash.
          </p>
        </Section>

        <Section title="WHAT IT DOES NOT RECORD">
          <p>
            It does not keep your IP address, your name, or your browser or device details in its database. It does not
            follow you to other sites. It uses no advertising and no third-party analytics.
          </p>
          <p>
            Your IP address is used while your request is handled. The hosting platform, Vercel, receives it with every
            request. The site also holds it in server memory for a short time to limit abuse, and it is not written to
            the database.
          </p>
        </Section>

        <Section title="THE HASH">
          <p>
            The hash is made from your IP address and a secret key that only the site owner has. Without that key it
            cannot be turned back into your IP address. With the key, and your IP address, the owner could check that a
            record is yours. The same IP address always gives the same hash, so the site can tell that one visitor came
            back. For IPv6, the hash covers your network prefix, not your exact address.
          </p>
          <p>Because of this, the hash still counts as personal data, and this page treats it that way.</p>
        </Section>

        <Section title="WHY">
          <p>
            To count unique and returning visitors, and to show country totals to the site owner. The legal basis is the
            owner&apos;s legitimate interest in knowing how the site is used.
          </p>
        </Section>

        <Section title="COOKIES">
          <p>The site does not set cookies for visitors. Only the site owner&apos;s sign-in uses one.</p>
        </Section>

        <Section title="SUBMISSIONS">
          <p>
            When you submit a project, what you type (name, description, category, link and optional X handle) is sent
            to a public pull request on GitHub. Anyone can read it there. After it is merged it is part of the
            repository history, and it cannot be fully erased. Do not put anything in it that you want to keep private.
          </p>
        </Section>

        <Section title="WHO HANDLES THE DATA">
          <p>
            Vercel hosts the site and works out your country. Neon stores the visit records. GitHub holds submissions.
            These companies are based in the United States. Visit records are kept until they are deleted. There is no
            automatic deletion yet.
          </p>
        </Section>

        <Section title="YOUR RIGHTS AND QUESTIONS">
          <p>
            You can ask to see, correct or delete data about you, and you can object to it being used. If you are in the
            UK, you can also complain to the Information Commissioner&apos;s Office.
          </p>
          <p>
            To ask a question or make a request, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-bp-accent">
              {CONTACT_EMAIL}
            </a>
            . To find your visit records, the owner needs your IP address, so include it in the email.
          </p>
        </Section>
      </div>
    </main>
  );
}
