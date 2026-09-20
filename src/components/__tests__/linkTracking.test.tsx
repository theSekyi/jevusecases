import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { guard } from "@/lib/__tests__/fixtures";
import { Footer } from "../Footer";
import { Header } from "../Header";
import { Hero } from "../Hero";
import { CopyButton } from "../projects/CopyButton";
import { FeaturedProject } from "../projects/FeaturedProject";
import { ProjectCard } from "../projects/ProjectCard";
import { ProjectPanel } from "../projects/ProjectPanel";

vi.mock("../Logo", () => ({ Logo: () => null }));

const full = { ...guard, source_tweet: "https://x.com/guardian/status/1", recipe: { type: "npm package", install: "npm i jev-guard" } };

describe("every link the site counts says what it is", () => {
  test("project cards open a project", () => {
    render(<><ProjectCard project={guard} index={0} /><FeaturedProject project={guard} /></>);

    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAttribute("data-track", "project_open");
      expect(link).toHaveAttribute("data-track-project", "guard");
    }
  });

  test("a project's panel labels its outgoing links, share button and copy buttons", () => {
    render(<ProjectPanel project={full} onClose={() => {}} />);

    const tracked = (name: string | RegExp) => screen.getByRole(name === "Copy install command" || name === "Copy link" ? "button" : "link", { name });
    expect(tracked("@guardian")).toHaveAttribute("data-track", "author");
    expect(tracked("github.com/example/jev-guard")).toHaveAttribute("data-track", "source");
    expect(tracked("Where it was announced")).toHaveAttribute("data-track", "tweet");
    expect(tracked("Post on X")).toHaveAttribute("data-track", "share_x");
    expect(tracked("Copy install command")).toHaveAttribute("data-track", "copy_install");
    expect(tracked("Copy link")).toHaveAttribute("data-track", "copy_link");
    for (const element of [tracked("@guardian"), tracked("Post on X"), tracked("Copy link"), tracked("Copy install command")]) {
      expect(element).toHaveAttribute("data-track-project", "guard");
    }
  });

  test("the submit buttons and the footer repository link are labelled", () => {
    render(<><Header /><Hero search={null} /><Footer /></>);

    const submits = screen.getAllByRole("link", { name: /submit/i });
    expect(submits).toHaveLength(3);
    for (const link of submits) expect(link).toHaveAttribute("data-track", "submit");
    expect(screen.getByRole("link", { name: "SOURCE" })).toHaveAttribute("data-track", "footer_repo");
    expect(screen.getByRole("link", { name: "PRIVACY" })).not.toHaveAttribute("data-track");
  });

  test("a copy button with nothing to track carries no label", () => {
    render(<CopyButton text="x" label="thing" />);

    expect(screen.getByRole("button", { name: "Copy thing" })).not.toHaveAttribute("data-track");
  });
});

/** Every source file for pages and components the visitor sees. Admin screens are not counted, so they are left out. */
function visitorSourceFiles(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (["__tests__", "admin", "api"].includes(name)) continue;
      visitorSourceFiles(path, found);
    } else if (name.endsWith(".tsx")) {
      found.push(path);
    }
  }
  return found;
}

/** The opening tags of every anchor or Link in a file. */
function anchorTags(source: string): string[] {
  return [...source.matchAll(/<(?:a|Link)(?=[\s>])(?:[^>]|=>)*>/g)].map((match) => match[0]);
}

/** A link that leaves the site (an address with a host, or one that opens a new tab) or goes to the submit page. */
function needsLabel(tag: string): boolean {
  return /target=/.test(tag) || /href=(?:"|'|\{["'`])https?:\/\//.test(tag) || /href=(?:"|'|\{["'`])\/submit["'`]/.test(tag);
}

describe("a new link cannot skip counting by accident", () => {
  const files = [...visitorSourceFiles("src/components"), ...visitorSourceFiles("src/app")];
  const tagsByFile = files.map((file) => [file, anchorTags(readFileSync(file, "utf8"))] as const);

  test("finds the files and the links it is meant to check", () => {
    expect(files.length).toBeGreaterThan(8);
    const labelled = tagsByFile.flatMap(([, tags]) => tags.filter(needsLabel));
    // The tracked links on the site today: author, source, tweet, Post on X, footer repo, and the four submit links.
    expect(labelled.length).toBeGreaterThanOrEqual(9);
  });

  test("every link that leaves the site, opens in a new tab, or goes to the submit page has a data-track", () => {
    for (const [file, tags] of tagsByFile) {
      for (const tag of tags.filter(needsLabel)) expect(tag, `${file}: ${tag}`).toContain("data-track=");
    }
  });

  test("a link to the submit page is labelled as submit", () => {
    for (const [file, tags] of tagsByFile) {
      for (const tag of tags.filter((candidate) => /href=(?:"|'|\{["'`])\/submit["'`]/.test(candidate))) {
        expect(tag, `${file}: ${tag}`).toContain('data-track="submit"');
      }
    }
  });

  test("every data-track names a real kind, and a project's own kinds say which project", async () => {
    const { isLinkKind, takesProject } = await import("@/lib/linkKinds");
    for (const [file, tags] of tagsByFile) {
      for (const tag of tags) {
        const kind = tag.match(/data-track="([^"]+)"/)?.[1];
        if (!kind) continue;
        expect(isLinkKind(kind), `${file}: ${kind}`).toBe(true);
        if (isLinkKind(kind) && takesProject(kind)) expect(tag, `${file}: ${tag}`).toContain("data-track-project=");
      }
    }
  });

  test("the guard itself catches a link written the ways a label could be skipped", () => {
    for (const unlabelled of [
      '<a href="https://example.com/x">x</a>',
      "<a href='https://example.com/x'>x</a>",
      '<a href={"https://example.com/x"}>x</a>',
      '<a href={url} target="_blank">x</a>',
      '<a {...props} target={target}>x</a>',
      '<Link href="/submit">x</Link>',
      "<Link\n  href='/submit'\n  className={a > b ? 'x' : 'y'}\n>x</Link>",
    ]) {
      const [tag] = anchorTags(unlabelled);
      expect(needsLabel(tag), unlabelled).toBe(true);
      expect(tag).not.toContain("data-track=");
    }
    expect(needsLabel(anchorTags('<a href="/privacy">x</a>')[0])).toBe(false);
  });
});
