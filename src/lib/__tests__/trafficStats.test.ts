import { afterEach, describe, expect, test, vi } from "vitest";
import { getTrafficSummary, MIN_COUNTRY_VISITS, summarizeTraffic, TRAFFIC_WINDOW_DAYS } from "../trafficStats";

const sqlMock = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sqlMock }));

describe("summarizeTraffic", () => {
  test("ranks countries by visits, most first, with the total across all rows", () => {
    const summary = summarizeTraffic([
      { country: "US", visits: 10 },
      { country: "GB", visits: 30 },
      { country: "CA", visits: 5 },
    ]);

    expect(summary.rows).toEqual([
      { kind: "country", country: "GB", visits: 30 },
      { kind: "country", country: "US", visits: 10 },
      { kind: "country", country: "CA", visits: 5 },
    ]);
    expect(summary.total).toBe(45);
  });

  test("breaks ties by country code so the order is stable", () => {
    const summary = summarizeTraffic([
      { country: "FR", visits: 4 },
      { country: "DE", visits: 4 },
    ]);

    expect(summary.rows.map((row) => (row.kind === "country" ? row.country : row.kind))).toEqual(["DE", "FR"]);
  });

  test("folds countries below the minimum into one 'other' row, never naming them", () => {
    const summary = summarizeTraffic([
      { country: "US", visits: 20 },
      { country: "KZ", visits: 1 },
      { country: "HU", visits: MIN_COUNTRY_VISITS - 1 },
      { country: "SG", visits: MIN_COUNTRY_VISITS },
    ]);

    expect(summary.rows).toEqual([
      { kind: "country", country: "US", visits: 20 },
      { kind: "country", country: "SG", visits: MIN_COUNTRY_VISITS },
      { kind: "other", visits: 1 + MIN_COUNTRY_VISITS - 1 },
    ]);
    expect(JSON.stringify(summary)).not.toContain("KZ");
    expect(JSON.stringify(summary)).not.toContain("HU");
  });

  test("groups missing or malformed locations as unknown, before 'other'", () => {
    const summary = summarizeTraffic([
      { country: "US", visits: 9 },
      { country: null, visits: 2 },
      { country: "<script>", visits: 1 },
      { country: "KZ", visits: 1 },
    ]);

    expect(summary.rows).toEqual([
      { kind: "country", country: "US", visits: 9 },
      { kind: "unknown", visits: 3 },
      { kind: "other", visits: 1 },
    ]);
    expect(summary.total).toBe(13);
  });

  test("an empty window is an empty summary, not an invented one", () => {
    expect(summarizeTraffic([])).toEqual({ total: 0, rows: [] });
  });

  test("normalizes a lowercase country code", () => {
    expect(summarizeTraffic([{ country: "gb", visits: 5 }]).rows).toEqual([
      { kind: "country", country: "GB", visits: 5 },
    ]);
  });
});

describe("getTrafficSummary", () => {
  afterEach(() => {
    sqlMock.mockReset();
  });

  test("reads only country counts for the fixed window, and takes no arguments", async () => {
    sqlMock.mockResolvedValueOnce([{ country: "US", visits: 12 }]);

    const summary = await getTrafficSummary();

    expect(getTrafficSummary.length).toBe(0);
    const [strings, ...values] = sqlMock.mock.calls[0];
    const statement = strings.join("?");
    expect(statement).toContain("GROUP BY country");
    expect(statement).not.toMatch(/SELECT\s+(\*|id|path)/i);
    expect(values).toEqual([TRAFFIC_WINDOW_DAYS]);
    expect(summary.total).toBe(12);
  });
});
