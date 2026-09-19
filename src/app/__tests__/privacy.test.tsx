import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import PrivacyPage from "../privacy/page";
import { Footer } from "@/components/Footer";

describe("privacy page", () => {
  test("says what is recorded per page view, including pages that don't exist", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("What this site records about you");
    expect(screen.getByText(/a one-way hash of your IP address/)).toBeInTheDocument();
    expect(screen.getByText(/including pages that do not exist/)).toBeInTheDocument();
  });

  test("says the IP address is not kept in the database, but is used while handling the request and held briefly in memory", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/does not keep your IP address, your name/)).toBeInTheDocument();
    expect(screen.getByText(/holds it in server memory for a short time/)).toBeInTheDocument();
    expect(screen.getByText(/Vercel, receives it with every request/)).toBeInTheDocument();
  });

  test("says the referring site is recorded by hostname only, and that a ref tag is kept", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/the website that linked you here, by its hostname only/)).toBeInTheDocument();
    expect(screen.getByText(/\?ref=newsletter/)).toBeInTheDocument();
  });

  test("doesn't claim the hash is anonymous: it is reversible with the key and is still personal data", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/Without that key it cannot be turned back/)).toBeInTheDocument();
    expect(screen.getByText(/still counts as personal data/)).toBeInTheDocument();
  });

  test("says the public strip never shows a hash, and that visitors get no cookies", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/It never shows a hash/)).toBeInTheDocument();
    expect(screen.getByText(/does not set cookies for visitors/)).toBeInTheDocument();
  });

  test("covers submissions, processors, rights and how to ask a question", () => {
    render(<PrivacyPage />);

    for (const heading of ["SUBMISSIONS", "WHO HANDLES THE DATA", "YOUR RIGHTS AND QUESTIONS", "WHY"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByText(/cannot be fully erased/)).toBeInTheDocument();
    expect(screen.getByText(/are based in the United States/)).toBeInTheDocument();
    expect(screen.getByText(/pass through the domain registrar/)).toBeInTheDocument();
    expect(screen.getByText(/Information Commissioner/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "privacy@jevusecases.com" })).toHaveAttribute(
      "href",
      "mailto:privacy@jevusecases.com",
    );
  });

  test("explains that finding visit records needs the visitor's own IP address, sent by email", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/the owner needs the IP address you used when you visited/)).toBeInTheDocument();
  });

  test("is honest that nothing is deleted automatically yet", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/no\s+automatic deletion yet/)).toBeInTheDocument();
  });
});

describe("footer", () => {
  test("links to the privacy page", () => {
    render(<Footer />);

    expect(screen.getByRole("link", { name: "PRIVACY" })).toHaveAttribute("href", "/privacy");
  });
});
