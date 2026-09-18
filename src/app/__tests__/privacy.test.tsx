import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import PrivacyPage from "../privacy/page";
import { Footer } from "@/components/Footer";

describe("privacy page", () => {
  test("says what is recorded per page view, and that the IP address is not stored", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("What this site records about you");
    expect(screen.getByText(/a one-way hash of your IP address/)).toBeInTheDocument();
    expect(screen.getAllByText(/does not store your IP address/)).toHaveLength(2);
  });

  test("covers cookies, public submissions, processors and how to ask a question", () => {
    render(<PrivacyPage />);

    for (const heading of ["COOKIES", "SUBMISSIONS", "WHO HANDLES THE DATA", "QUESTIONS OR REQUESTS"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByText(/sent to a public pull request on GitHub/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open an issue on GitHub" })).toHaveAttribute(
      "href",
      expect.stringContaining("/issues"),
    );
  });

  test("is honest that nothing is deleted automatically yet", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/no automatic deletion yet/)).toBeInTheDocument();
  });
});

describe("footer", () => {
  test("links to the privacy page", () => {
    render(<Footer />);

    expect(screen.getByRole("link", { name: "PRIVACY" })).toHaveAttribute("href", "/privacy");
  });
});
