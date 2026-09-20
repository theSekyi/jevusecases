import { afterEach, describe, expect, test, vi } from "vitest";
import { OUTGOING_KINDS } from "../linkKinds";
import { makeProject } from "./fixtures";

const transaction = vi.fn();
const sqlMock = Object.assign(vi.fn(), { transaction });
vi.mock("@/lib/db", () => ({ db: () => sqlMock }));

const {
  clickHost,
  DUPLICATE_CLICK_WINDOW_MS,
  getLinkClickSummary,
  recordLinkClick,
  summarizeLinkClicks,
} = await import("../linkClicks");
const { TRAFFIC_WINDOW_DAYS } = await import("../visitorFormat");

/** The text of each statement in a transaction, with the values shown as ? and whitespace collapsed. */
const statementsOf = (calls: unknown[]) => calls.map((call) => (call as [string[]])[0].join("?").replace(/\s+/g, " ").trim());
const valuesOf = (calls: unknown[]) => calls.flatMap((call) => (call as unknown[]).slice(1));

describe("clickHost", () => {
  const project = makeProject({
    github: "https://github.com/acme/tool",
    source_tweet: "https://x.com/acme/status/1",
    author: "@acme",
  });

  test("works the destination out from the project's own data", () => {
    expect(clickHost("source", project)).toBe("github.com");
    expect(clickHost("tweet", project)).toBe("x.com");
    expect(clickHost("author", project)).toBe("x.com");
  });

  test("falls back to the website when there is no repository, and drops www", () => {
    expect(clickHost("source", makeProject({ website: "https://www.example.com/docs" }))).toBe("example.com");
  });

  test("has no host where nothing is being followed, or the project lacks the link", () => {
    expect(clickHost("project_open", project)).toBeNull();
    expect(clickHost("copy_link", project)).toBeNull();
    expect(clickHost("copy_install", project)).toBeNull();
    expect(clickHost("submit", null)).toBeNull();
    expect(clickHost("source", makeProject())).toBeNull();
    expect(clickHost("tweet", makeProject())).toBeNull();
    expect(clickHost("author", makeProject())).toBeNull();
    expect(clickHost("source", null)).toBeNull();
  });

  test("names the fixed destinations for the share button and the footer link", () => {
    expect(clickHost("share_x", project)).toBe("x.com");
    expect(clickHost("footer_repo", null)).toBe("github.com");
  });

  test("never throws on a malformed stored address", () => {
    expect(clickHost("tweet", makeProject({ source_tweet: "not a url" } as never))).toBeNull();
  });
});

describe("recordLinkClick", () => {
  afterEach(() => {
    sqlMock.mockReset();
    transaction.mockReset();
  });

  const click = { kind: "source" as const, projectId: "guard", host: "github.com", path: "/", visitorHash: "abc" };

  test("takes the lock and inserts in one transaction, with every value as a parameter", async () => {
    sqlMock.mockImplementation((...args: unknown[]) => args);
    await recordLinkClick(click);

    const [queries] = transaction.mock.calls[0] as [unknown[]];
    const statements = statementsOf(queries);
    expect(statements[0]).toContain("lock_timeout");
    expect(statements[1]).toContain("pg_advisory_xact_lock");
    expect(statements[2]).toContain("INSERT INTO link_clicks (visitor_hash, kind, project_id, host, path)");
    const values = valuesOf(queries.slice(2));
    expect(values).toEqual(expect.arrayContaining(["abc", "source", "guard", "github.com", "/", DUPLICATE_CLICK_WINDOW_MS]));
    // Nothing the caller passed is spliced into the statement text.
    for (const statement of statements) expect(statement).not.toMatch(/guard|github\.com/);
  });

  test("drops a repeat of the same click by the same visitor, matching a missing project or visitor null-safely", async () => {
    sqlMock.mockImplementation((...args: unknown[]) => args);
    await recordLinkClick({ ...click, projectId: null, visitorHash: null });

    const [queries] = transaction.mock.calls[0] as [unknown[]];
    const insert = statementsOf(queries)[2];
    expect(insert).toContain("WHERE NOT EXISTS");
    expect(insert).toContain("kind = ?::text");
    expect(insert).toContain("project_id IS NOT DISTINCT FROM ?::text");
    expect(insert).toContain("visitor_hash IS NOT DISTINCT FROM ?::text");
    expect(insert).toMatch(/created_at > now\(\) - \(\?::text \|\| ' milliseconds'\)::interval/);
  });
});

describe("summarizeLinkClicks", () => {
  const names = (id: string) => ({ a: "Alpha", b: "Beta", c: "Gamma" })[id] ?? null;
  const empty = { total: { clicks: 0, clickers: 0 }, kinds: [], projects: [], hosts: [] };

  test("names a kind only once enough people did it, and folds the rest into Other", () => {
    const summary = summarizeLinkClicks(
      {
        ...empty,
        total: { clicks: 15, clickers: 9 },
        kinds: [
          { kind: "project_open", clicks: 8, clickers: 5 },
          { kind: "submit", clicks: 3, clickers: 3 },
          { kind: "copy_link", clicks: 2, clickers: 2 },
          { kind: "footer_repo", clicks: 2, clickers: 1 },
        ],
      },
      names,
    );

    expect(summary.kinds.map((row) => [row.kind, row.clickers])).toEqual([
      ["project_open", 5],
      ["submit", 3],
      ["other", 3],
    ]);
    expect(JSON.stringify(summary)).not.toContain("Copied a project link");
    expect(JSON.stringify(summary)).not.toContain("Site repository");
    expect(summary.clicks).toBe(15);
    expect(summary.clickers).toBe(9);
  });

  test("shows no Other row when nothing was folded, and ignores a kind it does not know", () => {
    const summary = summarizeLinkClicks(
      { ...empty, kinds: [{ kind: "submit", clicks: 4, clickers: 4 }, { kind: "made_up", clicks: 9, clickers: 9 }] },
      names,
    );
    expect(summary.kinds.map((row) => row.kind)).toEqual(["submit"]);
  });

  test("orders equal counts by label, so the list does not shuffle between loads", () => {
    const summary = summarizeLinkClicks(
      { ...empty, kinds: [{ kind: "submit", clicks: 3, clickers: 3 }, { kind: "source", clicks: 3, clickers: 3 }] },
      names,
    );
    expect(summary.kinds.map((row) => row.label)).toEqual(["Followed a source link", "Submit a project"]);
  });

  test("lists a project only when enough people opened it, with how many went on to follow a link", () => {
    const summary = summarizeLinkClicks(
      {
        ...empty,
        projects: [
          { projectId: "a", bucket: "open", clickers: 6 },
          { projectId: "a", bucket: "out", clickers: 2 },
          { projectId: "b", bucket: "open", clickers: 2 },
          { projectId: "b", bucket: "out", clickers: 2 },
          { projectId: "c", bucket: "out", clickers: 9 },
        ],
      },
      names,
    );

    expect(summary.projects).toEqual([{ id: "a", name: "Alpha", opened: 6, followed: 2 }]);
  });

  test("falls back to the id for a project that has since been removed, and orders by opens then name", () => {
    const summary = summarizeLinkClicks(
      {
        ...empty,
        projects: [
          { projectId: "gone", bucket: "open", clickers: 4 },
          { projectId: "b", bucket: "open", clickers: 4 },
          { projectId: "a", bucket: "open", clickers: 7 },
        ],
      },
      names,
    );
    expect(summary.projects.map((row) => row.name)).toEqual(["Alpha", "Beta", "gone"]);
  });

  test("lists a host only when enough people went there, and caps the list", () => {
    const hosts = Array.from({ length: 12 }, (_, index) => ({ host: `site${String(index).padStart(2, "0")}.example`, clickers: 3 + index }));
    const summary = summarizeLinkClicks({ ...empty, hosts: [...hosts, { host: "tiny.example", clickers: 2 }] }, names);

    expect(summary.hosts).toHaveLength(8);
    expect(summary.hosts[0]).toEqual({ host: "site11.example", clickers: 14 });
    expect(summary.hosts.map((row) => row.host)).not.toContain("tiny.example");
  });
});

describe("getLinkClickSummary", () => {
  afterEach(() => {
    sqlMock.mockReset();
    transaction.mockReset();
  });

  test("reads the trailing window in one transaction and returns the summarized counts", async () => {
    sqlMock.mockImplementation((...args: unknown[]) => args);
    transaction.mockResolvedValueOnce([
      [{ clicks: 10, clickers: 6 }],
      [{ kind: "submit", clicks: 10, clickers: 6 }],
      [{ project_id: "a", bucket: "open", clickers: 5 }],
      [{ host: "github.com", clickers: 4 }],
    ]);

    const summary = await getLinkClickSummary((id) => (id === "a" ? "Alpha" : null));

    expect(summary).toMatchObject({
      clicks: 10,
      clickers: 6,
      kinds: [{ kind: "submit", clickers: 6 }],
      projects: [{ id: "a", name: "Alpha", opened: 5, followed: 0 }],
      hosts: [{ host: "github.com", clickers: 4 }],
    });
    const [queries] = transaction.mock.calls[0] as [unknown[]];
    expect(queries).toHaveLength(4);
    expect(statementsOf(queries).every((statement) => statement.includes("now() - (?::text || ' days')::interval"))).toBe(true);
    expect(valuesOf(queries)).toEqual(Array(4).fill(TRAFFIC_WINDOW_DAYS));
  });

  test("counts each visitor once, and every click without a visitor hash once", async () => {
    sqlMock.mockImplementation((...args: unknown[]) => args);
    transaction.mockResolvedValueOnce([[], [], [], []]);
    await getLinkClickSummary(() => null);

    const [queries] = transaction.mock.calls[0] as [unknown[]];
    for (const statement of statementsOf(queries)) {
      expect(statement).toContain("count(DISTINCT visitor_hash) + count(*) FILTER (WHERE visitor_hash IS NULL)");
    }
  });

  test("the outgoing kinds written into the statements are the ones in the list", async () => {
    sqlMock.mockImplementation((...args: unknown[]) => args);
    transaction.mockResolvedValueOnce([[], [], [], []]);
    await getLinkClickSummary(() => null);

    const [queries] = transaction.mock.calls[0] as [unknown[]];
    const [, , projectQuery, hostQuery] = statementsOf(queries);
    const listed = `IN (${OUTGOING_KINDS.map((kind) => `'${kind}'`).join(", ")})`;
    expect(projectQuery).toContain(listed);
    expect(hostQuery).toContain(listed);
  });

  test("reports nothing, without failing, when there are no clicks yet", async () => {
    sqlMock.mockImplementation((...args: unknown[]) => args);
    transaction.mockResolvedValueOnce([[], [], [], []]);
    expect(await getLinkClickSummary(() => null)).toEqual({ clicks: 0, clickers: 0, kinds: [], projects: [], hosts: [] });
  });
});
