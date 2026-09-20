import { afterEach, describe, expect, test, vi } from "vitest";
import { MAX_LINK_ROWS, MIN_LINK_CLICKERS, OUTGOING_KINDS } from "../linkKinds";
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
const valuesOf = (call: unknown) => (call as unknown[]).slice(1);

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

  async function queriesFor(input: Parameters<typeof recordLinkClick>[0]) {
    sqlMock.mockImplementation((...args: unknown[]) => args);
    await recordLinkClick(input);
    return (transaction.mock.calls[0] as [unknown[]])[0];
  }

  test("repeats within three seconds are dropped", () => {
    expect(DUPLICATE_CLICK_WINDOW_MS).toBe(3000);
  });

  test("takes the lock and inserts in one transaction, with every value as a parameter, in the column order", async () => {
    const queries = await queriesFor(click);

    const [timeout, lock, insert] = statementsOf(queries);
    expect(timeout).toBe("SET LOCAL lock_timeout = '2s'");
    expect(lock).toBe("SELECT pg_advisory_xact_lock(?)");
    expect(insert).toBe(
      "INSERT INTO link_clicks (visitor_hash, kind, project_id, host, path) " +
        "SELECT ?::text, ?::text, ?::text, ?::text, ?::text " +
        "WHERE NOT EXISTS ( SELECT 1 FROM link_clicks " +
        "WHERE created_at > now() - (?::text || ' milliseconds')::interval " +
        "AND visitor_hash = ?::text AND kind = ?::text AND project_id IS NOT DISTINCT FROM ?::text )",
    );
    expect(valuesOf(queries[1])).toEqual([41_002]);
    // The values go in the order of the columns, then the same visitor, kind and project again for the check.
    expect(valuesOf(queries[2])).toEqual(["abc", "source", "guard", "github.com", "/", 3000, "abc", "source", "guard"]);
  });

  test("a click with no project is matched on having none, not skipped", async () => {
    const queries = await queriesFor({ ...click, kind: "submit", projectId: null, host: null, path: null });

    expect(statementsOf(queries)[2]).toContain("project_id IS NOT DISTINCT FROM ?::text");
    expect(valuesOf(queries[2])).toEqual(["abc", "submit", null, null, null, 3000, "abc", "submit", null]);
  });

  test("uses a lock key of its own, not the page views'", async () => {
    const queries = await queriesFor(click);
    expect(valuesOf(queries[1])).not.toEqual([41_001]);
  });
});

describe("summarizeLinkClicks", () => {
  const names = (id: string) => ({ a: "Alpha", b: "Beta", c: "Gamma" })[id] ?? null;
  const counts = (overrides: Partial<Parameters<typeof summarizeLinkClicks>[0]> = {}) => ({
    total: { clicks: 40, clickers: 12 },
    kinds: [],
    projects: [],
    hosts: [],
    ...overrides,
  });

  test("says only that there are too few people when the total is under the floor, and sends nothing else", () => {
    const summary = summarizeLinkClicks(
      counts({
        total: { clicks: 4, clickers: MIN_LINK_CLICKERS - 1 },
        kinds: [{ kind: "submit", clicks: 4, clickers: 2 }],
        projects: [{ projectId: "a", opened: 2, followed: 1 }],
        hosts: [{ host: "github.com", clickers: 2 }],
      }),
      names,
    );

    expect(summary).toEqual({ clicks: 0, clickers: 0, tooFew: true, kinds: [], projects: [], hosts: [] });
  });

  test("says nothing is too few when there are no clicks at all", () => {
    expect(summarizeLinkClicks(counts({ total: { clicks: 0, clickers: 0 } }), names)).toMatchObject({ tooFew: false, clicks: 0 });
  });

  test("shows the totals once enough people have clicked", () => {
    const summary = summarizeLinkClicks(counts({ total: { clicks: 9, clickers: MIN_LINK_CLICKERS } }), names);
    expect(summary).toMatchObject({ clicks: 9, clickers: MIN_LINK_CLICKERS, tooFew: false });
  });

  test("names a kind at exactly the floor, and folds one under it", () => {
    const summary = summarizeLinkClicks(
      counts({
        kinds: [
          { kind: "submit", clicks: 3, clickers: MIN_LINK_CLICKERS },
          { kind: "copy_link", clicks: 9, clickers: MIN_LINK_CLICKERS - 1 },
          { kind: "footer_repo", clicks: 1, clickers: 1 },
        ],
      }),
      names,
    );

    expect(summary.kinds.map((row) => row.kind)).toEqual(["submit", "other"]);
    expect(summary.kinds[1]).toMatchObject({ clickers: 3, clicks: 10 });
    expect(JSON.stringify(summary)).not.toContain("Pressed Copy link");
  });

  test("shows no Other row while the small kinds together are still under the floor", () => {
    const summary = summarizeLinkClicks(
      counts({ kinds: [{ kind: "submit", clicks: 5, clickers: 5 }, { kind: "copy_link", clicks: 1, clickers: 1 }, { kind: "footer_repo", clicks: 1, clickers: 1 }] }),
      names,
    );

    expect(summary.kinds.map((row) => row.kind)).toEqual(["submit"]);
  });

  test("ignores a kind it does not know, and orders equal counts by label", () => {
    const summary = summarizeLinkClicks(
      counts({
        kinds: [
          { kind: "made_up", clicks: 9, clickers: 9 },
          { kind: "submit", clicks: 3, clickers: 3 },
          { kind: "source", clicks: 3, clickers: 3 },
        ],
      }),
      names,
    );
    expect(summary.kinds.map((row) => row.label)).toEqual(["Followed a source link", "Pressed Submit a project"]);
  });

  test("lists a project at exactly the floor and drops the count of followers when it is under it", () => {
    const summary = summarizeLinkClicks(
      counts({
        projects: [
          { projectId: "a", opened: 6, followed: 3 },
          { projectId: "b", opened: MIN_LINK_CLICKERS, followed: 2 },
        ],
      }),
      names,
    );

    expect(summary.projects).toEqual([
      { id: "a", name: "Alpha", opened: 6, followed: 3 },
      { id: "b", name: "Beta", opened: MIN_LINK_CLICKERS, followed: null },
    ]);
    expect(JSON.stringify(summary.projects)).not.toContain('"followed":2');
  });

  test("gathers projects that are too small into one row that appears only once they add up", () => {
    const small = (id: string, opened: number, followed: number) => ({ projectId: id, opened, followed });

    const shown = summarizeLinkClicks(counts({ projects: [small("a", 5, 0), small("b", 2, 1), small("c", 1, 1)] }), names);
    expect(shown.projects.map((row) => row.name)).toEqual(["Alpha", "Other projects"]);
    expect(shown.projects[1]).toMatchObject({ id: null, opened: 3, followed: null });

    const hidden = summarizeLinkClicks(counts({ projects: [small("a", 5, 0), small("b", 2, 1)] }), names);
    expect(hidden.projects.map((row) => row.name)).toEqual(["Alpha"]);
  });

  test("falls back to the id for a project that has since been removed, and orders by opens then name", () => {
    const summary = summarizeLinkClicks(
      counts({
        projects: [
          { projectId: "gone", opened: 4, followed: 0 },
          { projectId: "b", opened: 4, followed: 0 },
          { projectId: "a", opened: 7, followed: 0 },
        ],
      }),
      names,
    );
    expect(summary.projects.map((row) => row.name)).toEqual(["Alpha", "Beta", "gone"]);
  });

  test("caps the named projects and hosts, folding the rest into Other", () => {
    const projects = Array.from({ length: MAX_LINK_ROWS + 2 }, (_, index) => ({ projectId: `p${String(index).padStart(2, "0")}`, opened: 20 - index, followed: 0 }));
    const hosts = Array.from({ length: MAX_LINK_ROWS + 2 }, (_, index) => ({ host: `site${String(index).padStart(2, "0")}.example`, clickers: 20 - index }));

    const summary = summarizeLinkClicks(counts({ projects, hosts }), names);

    expect(summary.projects).toHaveLength(MAX_LINK_ROWS + 1);
    expect(summary.projects.at(-1)).toMatchObject({ name: "Other projects", opened: 12 + 11 });
    expect(summary.hosts).toHaveLength(MAX_LINK_ROWS + 1);
    expect(summary.hosts.at(-1)).toEqual({ label: "Other sites", clickers: 12 + 11, other: true });
    expect(summary.hosts[0]).toEqual({ label: "site00.example", clickers: 20, other: false });
  });

  test("lists a host at exactly the floor, and folds one under it", () => {
    const summary = summarizeLinkClicks(
      counts({ hosts: [{ host: "a.example", clickers: MIN_LINK_CLICKERS }, { host: "b.example", clickers: 2 }, { host: "c.example", clickers: 1 }] }),
      names,
    );

    expect(summary.hosts.map((row) => row.label)).toEqual(["a.example", "Other sites"]);
    expect(JSON.stringify(summary)).not.toContain("b.example");
    expect(JSON.stringify(summary)).not.toContain("c.example");
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
      [{ project_id: "a", opened: 5, followed: 3 }],
      [{ host: "github.com", clickers: 4 }],
    ]);

    const summary = await getLinkClickSummary((id) => (id === "a" ? "Alpha" : null));

    expect(summary).toEqual({
      clicks: 10,
      clickers: 6,
      tooFew: false,
      kinds: [{ kind: "submit", label: "Pressed Submit a project", clickers: 6, clicks: 10 }],
      projects: [{ id: "a", name: "Alpha", opened: 5, followed: 3 }],
      hosts: [{ label: "github.com", clickers: 4, other: false }],
    });
    const [queries] = transaction.mock.calls[0] as [unknown[]];
    expect(queries).toHaveLength(4);
    expect(statementsOf(queries).every((statement) => statement.includes("now() - (?::text || ' days')::interval"))).toBe(true);
    expect(queries.map(valuesOf)).toEqual(Array(4).fill([TRAFFIC_WINDOW_DAYS]));
  });

  test("counts each visitor once", async () => {
    sqlMock.mockImplementation((...args: unknown[]) => args);
    transaction.mockResolvedValueOnce([[], [], [], []]);
    await getLinkClickSummary(() => null);

    const [queries] = transaction.mock.calls[0] as [unknown[]];
    const [total, kinds, , hosts] = statementsOf(queries);
    for (const statement of [total, kinds, hosts]) expect(statement).toContain("count(DISTINCT visitor_hash)");
  });

  test("counts followers only among the people who opened the project, one person once", async () => {
    sqlMock.mockImplementation((...args: unknown[]) => args);
    transaction.mockResolvedValueOnce([[], [], [], []]);
    await getLinkClickSummary(() => null);

    const [queries] = transaction.mock.calls[0] as [unknown[]];
    const projectQuery = statementsOf(queries)[2];
    expect(projectQuery).toContain("bool_or(kind = 'project_open') AS opened");
    expect(projectQuery).toContain("GROUP BY project_id, visitor_hash");
    expect(projectQuery).toContain("count(*) FILTER (WHERE opened AND followed)");
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
    expect(await getLinkClickSummary(() => null)).toEqual({ clicks: 0, clickers: 0, tooFew: false, kinds: [], projects: [], hosts: [] });
  });
});
