import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SubmitPage from "../page";

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("PROJECT NAME"), { target: { value: "Jev Trader" } });
  fireEvent.change(screen.getByLabelText("DESCRIPTION"), {
    target: { value: "Decides buy/sell on a live price feed." },
  });
  fireEvent.change(screen.getByLabelText("CATEGORY"), {
    target: { value: "trading / on-chain agents" },
  });
  fireEvent.change(screen.getByLabelText("SOURCE LINK"), {
    target: { value: "https://github.com/jarrodwatts/jev-trader" },
  });
}

describe("SubmitPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("blocks submit and shows a reason when required fields are empty", async () => {
    render(<SubmitPage />);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Project name is required")).toBeInTheDocument();
    expect(screen.getByText("Description is required")).toBeInTheDocument();
    expect(screen.getByText("Source link is required")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("rejects a source link outside the host allowlist before submitting", async () => {
    render(<SubmitPage />);
    fillValidForm();
    fireEvent.change(screen.getByLabelText("SOURCE LINK"), {
      target: { value: "https://evil.example.com/malware" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText(/github\.com and npmjs\.com/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("shows the success state and clears the form after a successful submit", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }));
    render(<SubmitPage />);
    fillValidForm();

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText(/it's in the queue/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/submit",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("shows a rate-limit-specific message on a 429 response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 429 }));
    render(<SubmitPage />);
    fillValidForm();

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText(/hit the submission limit/i)).toBeInTheDocument();
  });

  test("shows a generic error message when the request fails outright", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));
    render(<SubmitPage />);
    fillValidForm();

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() =>
      expect(screen.getByText(/something went wrong submitting/i)).toBeInTheDocument(),
    );
  });

  test("clears a stale submit-level error once the user resubmits, even if the new attempt fails validation first", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 429 }));
    render(<SubmitPage />);
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText(/hit the submission limit/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("PROJECT NAME"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Project name is required")).toBeInTheDocument();
    expect(screen.queryByText(/hit the submission limit/i)).not.toBeInTheDocument();
  });
});
