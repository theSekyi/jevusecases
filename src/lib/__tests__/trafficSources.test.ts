import { afterEach, describe, expect, test, vi } from "vitest";
import {
  MIN_SOURCE_LANDINGS,
  getTrafficSources,
  sourceName,
  summarizeSources,
  type SourceCounts,
} from "../trafficSources";
import { TRAFFIC_WINDOW_DAYS } from "../trafficStats";
import { DIRECT_SOURCE, INTERNAL_SOURCE } from "../visitorEvents";

const sqlMock = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sqlMock }));

const from = (referrerHost: string | null, landings: number, ref: string | null = null): SourceCounts => ({ ref, referrerHost, landings });
const labels = (counts: SourceCounts[]) => summarizeSources(counts).rows.map((row) => row.label);

describe("sourceName", () => {
  test("gives well-known sites the name people use, whichever address the click came through", () => {
    expect(sourceName("t.co")).toBe("X");
    expect(sourceName("x.com")).toBe("X");
    expect(sourceName("lnkd.in")).toBe("LinkedIn");
    expect(sourceName("www.linkedin.com")).toBe("LinkedIn");
    expect(sourceName("news.ycombinator.com")).toBe("Hacker News");
    expect(sourceName("old.reddit.com")).toBe("Reddit");
    expect(sourceName("l.facebook.com")).toBe("Facebook");
    expect(sourceName("out.reddit.com")).toBe("Reddit");
    expect(sourceName("gist.github.com")).toBe("GitHub");
  });

  test("knows every country's Google", () => {
    for (const host of ["google.com", "www.google.com", "www.google.co.uk", "google.de", "www.google.com.au"]) {
      expect(sourceName(host), host).toBe("Google");
    }
  });

  test("doesn't mistake lookalikes for the real thing", () => {
    expect(sourceName("notgoogle.com")).toBe("notgoogle.com");
    expect(sourceName("google.com.evil.example")).toBe("google.com.evil.example");
    expect(sourceName("fakex.com")).toBe("fakex.com");
    expect(sourceName("mygithub.com")).toBe("mygithub.com");
  });

  test("shows any other site by its hostname without www, in lower case", () => {
    expect(sourceName("www.Example-Blog.com")).toBe("example-blog.com");
    expect(sourceName("blog.example.org")).toBe("blog.example.org");
  });
});

describe("summarizeSources", () => {
  test("ranks sources by landings, merging addresses that are the same site", () => {
    const summary = summarizeSources([from("t.co", 4), from("x.com", 3), from("news.ycombinator.com", 9), from("www.google.com", 5)]);

    expect(summary.rows).toEqual([
      { kind: "site", label: "Hacker News", landings: 9 },
      { kind: "site", label: "X", landings: 7 },
      { kind: "site", label: "Google", landings: 5 },
    ]);
    expect(summary.landings).toBe(21);
  });

  test("leaves out clicks inside the site, and rows from before source tracking", () => {
    const summary = summarizeSources([from(INTERNAL_SOURCE, 500), from(null, 800), from("t.co", 4)]);

    expect(summary.rows).toEqual([{ kind: "site", label: "X", landings: 4 }]);
    expect(summary.landings).toBe(4);
  });

  test("counts visits with no referrer as direct or unknown, and never folds it away however small", () => {
    const summary = summarizeSources([from(DIRECT_SOURCE, 1), from("t.co", 9)]);

    expect(summary.rows).toContainEqual({ kind: "direct", label: "Direct or unknown", landings: 1 });
  });

  test("names a tagged link by its tag, with the site the click came from", () => {
    const summary = summarizeSources([
      from("t.co", 5, "launch-post"),
      from("x.com", 2, "launch-post"),
      from(DIRECT_SOURCE, 1, "launch-post"),
      from("news.ycombinator.com", 6),
    ]);

    expect(summary.rows).toEqual([
      { kind: "tag", label: "launch-post", via: "X", landings: 8 },
      { kind: "site", label: "Hacker News", landings: 6 },
    ]);
  });

  test("a tag on a link with no referrer has no site behind it", () => {
    expect(summarizeSources([from(DIRECT_SOURCE, 4, "newsletter")]).rows).toEqual([
      { kind: "tag", label: "newsletter", via: null, landings: 4 },
    ]);
  });

  test("a tagged direct visit is the tag, not a second direct row", () => {
    const summary = summarizeSources([from(DIRECT_SOURCE, 4, "newsletter"), from(DIRECT_SOURCE, 5)]);

    expect(summary.rows.map((row) => row.kind).sort()).toEqual(["direct", "tag"]);
  });

  test("folds sources below the minimum into 'Other sites', never naming them", () => {
    const summary = summarizeSources([
      from("news.ycombinator.com", 20),
      from("tiny-blog.example", 1),
      from("another-blog.example", MIN_SOURCE_LANDINGS - 1),
      from("t.co", MIN_SOURCE_LANDINGS),
    ]);

    expect(summary.rows).toEqual([
      { kind: "site", label: "Hacker News", landings: 20 },
      { kind: "site", label: "X", landings: MIN_SOURCE_LANDINGS },
      { kind: "other", label: "Other sites", landings: MIN_SOURCE_LANDINGS },
    ]);
    expect(JSON.stringify(summary)).not.toContain("tiny-blog");
    expect(JSON.stringify(summary)).not.toContain("another-blog");
  });

  test("a single tiny source can't stand as 'Other' of one: the smallest named source joins it", () => {
    const summary = summarizeSources([from("news.ycombinator.com", 20), from("t.co", 5), from("tiny-blog.example", 1)]);

    expect(summary.rows).toEqual([
      { kind: "site", label: "Hacker News", landings: 20 },
      { kind: "other", label: "Other sites", landings: 6 },
    ]);
  });

  test("when 'Other' has to absorb something, it takes the smallest site before it touches a tagged link", () => {
    const summary = summarizeSources([
      from("t.co", 3, "launch"),
      from("news.ycombinator.com", 9),
      from("www.google.com", 4),
      from("tiny-blog.example", 1),
    ]);

    expect(summary.rows).toEqual([
      { kind: "site", label: "Hacker News", landings: 9 },
      { kind: "tag", label: "launch", via: "X", landings: 3 },
      { kind: "other", label: "Other sites", landings: 5 },
    ]);
  });

  test("with nothing but tags to absorb, it takes the smallest tag", () => {
    const summary = summarizeSources([from("t.co", 5, "a-tag"), from("t.co", 3, "b-tag"), from("tiny-blog.example", 1)]);

    expect(summary.rows).toEqual([
      { kind: "tag", label: "a-tag", via: "X", landings: 5 },
      { kind: "other", label: "Other sites", landings: 4 },
    ]);
  });

  test("folds a small tag the same way", () => {
    const summary = summarizeSources([from("t.co", 9), from("t.co", 1, "one-off-dm")]);

    expect(JSON.stringify(summary)).not.toContain("one-off-dm");
  });

  test("when everything is small, it is all one 'Other sites' row equal to the total", () => {
    const summary = summarizeSources([from("a.example", 1), from("b.example", 1)]);

    expect(summary.rows).toEqual([{ kind: "other", label: "Other sites", landings: 2 }]);
    expect(summary.landings).toBe(2);
  });

  test("ignores rows with no landings, and an empty list gives an empty summary", () => {
    expect(summarizeSources([from("t.co", 0)])).toEqual({ landings: 0, rows: [] });
    expect(summarizeSources([])).toEqual({ landings: 0, rows: [] });
  });

  test("lists the same order every time when counts tie", () => {
    expect(labels([from("b.example", 5), from("a.example", 5), from("c.example", 5)])).toEqual(["a.example", "b.example", "c.example"]);
  });
});

describe("getTrafficSources", () => {
  afterEach(() => {
    sqlMock.mockReset();
  });

  test("reads counts by tag and referring host for the fixed window, leaving out internal clicks, and summarizes them", async () => {
    sqlMock.mockResolvedValueOnce([
      { ref: null, referrer_host: "t.co", landings: 6 },
      { ref: "launch", referrer_host: "t.co", landings: 4 },
    ]);

    const summary = await getTrafficSources();

    const [strings, ...values] = sqlMock.mock.calls[0];
    const statement = strings.join("?");
    expect(statement).toContain("GROUP BY ref, referrer_host");
    expect(statement).toContain("referrer_host IS NOT NULL");
    expect(statement).toContain("referrer_host <> ");
    expect(values).toEqual([TRAFFIC_WINDOW_DAYS, INTERNAL_SOURCE]);
    expect(summary.rows).toEqual([
      { kind: "site", label: "X", landings: 6 },
      { kind: "tag", label: "launch", via: "X", landings: 4 },
    ]);
  });

  test("selects no visitor identifiers, paths or hashes", async () => {
    sqlMock.mockResolvedValueOnce([]);

    await getTrafficSources();

    const statement = sqlMock.mock.calls[0][0].join("?");
    expect(statement).not.toMatch(/visitor_hash|path|country/);
  });
});
