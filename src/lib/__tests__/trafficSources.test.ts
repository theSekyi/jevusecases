import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  MAX_NAMED_ROWS,
  MIN_SOURCE_VISITORS,
  getTrafficSources,
  sourceName,
  summarizeSources,
  type SourceCounts,
} from "../trafficSources";
import { TRAFFIC_WINDOW_DAYS } from "../trafficStats";
import { DIRECT_SOURCE, INTERNAL_SOURCE } from "../visitorEvents";

const sqlMock = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sqlMock }));

const MIN = MIN_SOURCE_VISITORS;
const from = (referrerHost: string | null, visitors: number, ref: string | null = null): SourceCounts => ({ ref, referrerHost, visitors });
const labels = (counts: SourceCounts[]) => summarizeSources(counts).rows.map((row) => row.label);

describe("sourceName", () => {
  test("gives well-known sites the name people use, whichever address the click came through", () => {
    const cases: [string, string][] = [
      ["t.co", "X"],
      ["x.com", "X"],
      ["www.x.com", "X"],
      ["twitter.com", "X"],
      ["www.twitter.com", "X"],
      ["mobile.twitter.com", "X"],
      ["lnkd.in", "LinkedIn"],
      ["www.linkedin.com", "LinkedIn"],
      ["news.ycombinator.com", "Hacker News"],
      ["old.reddit.com", "Reddit"],
      ["out.reddit.com", "Reddit"],
      ["l.facebook.com", "Facebook"],
      ["gist.github.com", "GitHub"],
      ["github.com", "GitHub"],
      ["l.instagram.com", "Instagram"],
      ["app.slack.com", "Slack"],
      ["www.producthunt.com", "Product Hunt"],
      ["bsky.app", "Bluesky"],
    ];
    for (const [host, name] of cases) expect(sourceName(host), host).toBe(name);
  });

  test("names Android apps by their package, since they send it as the referrer", () => {
    expect(sourceName("com.google.android.gm")).toBe("Gmail");
    expect(sourceName("com.twitter.android")).toBe("X");
    expect(sourceName("com.linkedin.android")).toBe("LinkedIn");
    expect(sourceName("com.google.android.googlequicksearchbox")).toBe("Google");
  });

  test("knows every country's Google search, but not its other services", () => {
    for (const host of ["google.com", "www.google.com", "www.google.co.uk", "google.de", "www.google.com.au"]) {
      expect(sourceName(host), host).toBe("Google");
    }
    expect(sourceName("mail.google.com")).toBe("mail.google.com");
    expect(sourceName("sites.google.com")).toBe("sites.google.com");
    expect(sourceName("google.xyz")).toBe("google.xyz");
  });

  test("doesn't mistake lookalikes for the real thing", () => {
    for (const host of ["notgoogle.com", "google.com.evil.example", "fakex.com", "mygithub.com", "x.com.evil.example", "evilt.co", "t.co.evil.example"]) {
      expect(sourceName(host), host).toBe(host);
    }
  });

  test("shows any other site by its hostname without www, in lower case", () => {
    expect(sourceName("www.Example-Blog.com")).toBe("example-blog.com");
    expect(sourceName("blog.example.org")).toBe("blog.example.org");
  });
});

describe("summarizeSources", () => {
  test("ranks sources by visitors, merging addresses that are the same site", () => {
    const summary = summarizeSources([from("t.co", 4), from("x.com", 3), from("news.ycombinator.com", 9), from("www.google.com", 5)]);

    expect(summary.rows).toEqual([
      { kind: "site", label: "Hacker News", visitors: 9 },
      { kind: "site", label: "X", visitors: 7 },
      { kind: "site", label: "Google", visitors: 5 },
    ]);
    expect(summary.visitors).toBe(21);
  });

  test("leaves out clicks inside the site, and rows from before arrivals were tracked", () => {
    const summary = summarizeSources([from(INTERNAL_SOURCE, 500), from(null, 800), from("t.co", 4)]);

    expect(summary.rows).toEqual([{ kind: "site", label: "X", visitors: 4 }]);
    expect(summary.visitors).toBe(4);
  });

  test("counts visits with no referrer as direct or unknown, and never folds it away however small", () => {
    const summary = summarizeSources([from(DIRECT_SOURCE, 1), from("t.co", MIN + 6)]);

    expect(summary.rows).toContainEqual({ kind: "direct", label: "Direct or unknown", visitors: 1 });
  });

  test("names a tagged link by its tag, with the site the clicks came through when that site sent enough", () => {
    const summary = summarizeSources([
      from("t.co", MIN + 2, "launch-post"),
      from("x.com", 2, "launch-post"),
      from(DIRECT_SOURCE, 1, "launch-post"),
      from("news.ycombinator.com", MIN + 3),
    ]);

    expect(summary.rows).toEqual([
      { kind: "tag", label: "launch-post", via: "X", visitors: MIN + 5 },
      { kind: "site", label: "Hacker News", visitors: MIN + 3 },
    ]);
  });

  test("a tag never names a small site: three visitors from three blogs is a tag with no 'via'", () => {
    const summary = summarizeSources([from("a.example", 1, "launch"), from("b.example", 1, "launch"), from("c.example", 1, "launch")]);

    expect(summary.rows).toEqual([{ kind: "tag", label: "launch", via: null, visitors: 3 }]);
    expect(JSON.stringify(summary)).not.toMatch(/a\.example|b\.example|c\.example/);
  });

  test("a tag on a link with no referrer has no site behind it", () => {
    expect(summarizeSources([from(DIRECT_SOURCE, MIN + 1, "newsletter")]).rows).toEqual([
      { kind: "tag", label: "newsletter", via: null, visitors: MIN + 1 },
    ]);
  });

  test("a tagged direct visit is the tag, not a second direct row", () => {
    const summary = summarizeSources([from(DIRECT_SOURCE, MIN + 1, "newsletter"), from(DIRECT_SOURCE, 5)]);

    expect(summary.rows.map((row) => row.kind).sort()).toEqual(["direct", "tag"]);
  });

  test("folds sources below the minimum into 'Other sites and tags', never naming them", () => {
    const summary = summarizeSources([
      from("news.ycombinator.com", MIN + 17),
      from("tiny-blog.example", 1),
      from("another-blog.example", MIN - 1),
      from("t.co", MIN),
    ]);

    expect(summary.rows).toEqual([
      { kind: "site", label: "Hacker News", visitors: MIN + 17 },
      { kind: "site", label: "X", visitors: MIN },
      { kind: "other", label: "Other sites and tags", visitors: MIN },
    ]);
    expect(JSON.stringify(summary)).not.toContain("tiny-blog");
    expect(JSON.stringify(summary)).not.toContain("another-blog");
  });

  test("a stray visitor can't swallow a real source: the other row stands alone, however small", () => {
    const summary = summarizeSources([from("news.ycombinator.com", 200), from("tiny.example", 1)]);

    expect(summary.rows).toEqual([
      { kind: "site", label: "Hacker News", visitors: 200 },
      { kind: "other", label: "Other sites and tags", visitors: 1 },
    ]);
  });

  test("a small tag folds into Other and is never named", () => {
    const summary = summarizeSources([from("t.co", MIN + 6), from("t.co", 1, "one-off-dm")]);

    expect(JSON.stringify(summary)).not.toContain("one-off-dm");
    expect(summary.rows).toEqual([
      { kind: "site", label: "X", visitors: MIN + 6 },
      { kind: "other", label: "Other sites and tags", visitors: 1 },
    ]);
  });

  test("many tags that are each too small can't be used to list them all: they all fold into one row", () => {
    const spam = Array.from({ length: 50 }, (_, index) => from(DIRECT_SOURCE, 1, `spam-${index}`));

    const summary = summarizeSources(spam);

    expect(summary.rows).toEqual([{ kind: "other", label: "Other sites and tags", visitors: 50 }]);
  });

  test("shows no more than the row limit of named sources, and folds the rest", () => {
    const many = Array.from({ length: MAX_NAMED_ROWS + 5 }, (_, index) => from(`site-${String(index).padStart(2, "0")}.example`, MIN + 20 - index));

    const summary = summarizeSources(many);

    expect(summary.rows.filter((row) => row.kind === "site")).toHaveLength(MAX_NAMED_ROWS);
    expect(summary.rows.at(-1)).toMatchObject({ kind: "other" });
    expect(summary.visitors).toBe(many.reduce((sum, row) => sum + row.visitors, 0));
  });

  test("when everything is small it is all one Other row equal to the total", () => {
    const summary = summarizeSources([from("a.example", 1), from("b.example", 1)]);

    expect(summary.rows).toEqual([{ kind: "other", label: "Other sites and tags", visitors: 2 }]);
    expect(summary.visitors).toBe(2);
  });

  test("ignores rows with no visitors, and an empty list gives an empty summary", () => {
    expect(summarizeSources([from("t.co", 0)])).toEqual({ visitors: 0, rows: [] });
    expect(summarizeSources([])).toEqual({ visitors: 0, rows: [] });
  });

  test("lists the same order every time when counts tie, whether they are sites or tags", () => {
    expect(labels([from("b.example", MIN), from("a.example", MIN), from("c.example", MIN)])).toEqual(["a.example", "b.example", "c.example"]);
    expect(labels([from(DIRECT_SOURCE, MIN, "b-tag"), from(DIRECT_SOURCE, MIN, "a-tag")])).toEqual(["a-tag", "b-tag"]);
  });

  test("a tag and a site with the same name stay separate rows", () => {
    const summary = summarizeSources([from("t.co", MIN + 1), from(DIRECT_SOURCE, MIN + 1, "X")]);

    expect(summary.rows.map((row) => [row.kind, row.label])).toEqual([["site", "X"], ["tag", "X"]]);
  });
});

describe("getTrafficSources", () => {
  const since = "2026-09-19T10:00:00.000Z";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    sqlMock.mockReset();
  });

  const statementOf = (call: unknown[]) => (call[0] as string[]).join("?").replace(/\s+/g, " ").trim();

  test("says it is collecting until an arrival has been recorded with a source", async () => {
    sqlMock.mockResolvedValueOnce([{ since: null }]);

    const summary = await getTrafficSources();

    expect(summary).toEqual({ visitors: 0, rows: [], partialSince: null, collecting: true });
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  test("counts distinct visitors per tag and host over the window, from when arrivals began to be marked, leaving out internal clicks", async () => {
    sqlMock.mockResolvedValueOnce([{ since }]).mockResolvedValueOnce([
      { ref: null, referrer_host: "t.co", visitors: 6 },
      { ref: "launch", referrer_host: "t.co", visitors: 4 },
    ]);

    const summary = await getTrafficSources();

    expect(statementOf(sqlMock.mock.calls[0])).toContain("min(created_at)");
    const [, ...firstValues] = sqlMock.mock.calls[0];
    expect(firstValues).toEqual([INTERNAL_SOURCE, DIRECT_SOURCE]);

    const query = statementOf(sqlMock.mock.calls[1]);
    expect(query).toContain("count(DISTINCT visitor_hash)");
    expect(query).toContain("FILTER (WHERE visitor_hash IS NULL)");
    expect(query).toContain("GROUP BY ref, referrer_host");
    expect(query).toMatch(/created_at > now\(\) - \(\?::text \|\| ' days'\)::interval/);
    expect(query).toMatch(/created_at >= \?::timestamptz/);
    expect(query).toMatch(/referrer_host <> \?/);
    const [, ...values] = sqlMock.mock.calls[1];
    expect(values).toEqual([TRAFFIC_WINDOW_DAYS, since, INTERNAL_SOURCE]);

    expect(summary.rows).toEqual([
      { kind: "site", label: "X", visitors: 6 },
      { kind: "tag", label: "launch", via: "X", visitors: 4 },
    ]);
    expect(summary.collecting).toBe(false);
  });

  test("says the numbers are partial when arrival tracking began inside the window", async () => {
    sqlMock.mockResolvedValueOnce([{ since }]).mockResolvedValueOnce([]);

    expect((await getTrafficSources()).partialSince).toBe(since);
  });

  test("says nothing about partial data once tracking is older than the window", async () => {
    sqlMock.mockResolvedValueOnce([{ since: "2026-09-01T10:00:00.000Z" }]).mockResolvedValueOnce([]);

    expect((await getTrafficSources()).partialSince).toBeNull();
  });

  test("selects no page paths, countries or raw visitor hashes", async () => {
    sqlMock.mockResolvedValueOnce([{ since }]).mockResolvedValueOnce([]);

    await getTrafficSources();

    const selected = statementOf(sqlMock.mock.calls[1]).split(" FROM ")[0].replace(/count\(\*\)/g, "").replace(/count\(DISTINCT visitor_hash\)/g, "");
    expect(selected).not.toMatch(/\bpath\b|\bcountry\b|\*|visitor_hash,/);
  });
});
