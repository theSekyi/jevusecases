import { afterEach, describe, expect, test, vi } from "vitest";
import {
  formatShare,
  getTrafficSummary,
  MIN_COUNTRY_VISITS,
  summarizeTraffic,
  TRAFFIC_WINDOW_DAYS,
  type TrafficRow,
} from "../trafficStats";

const sqlMock = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sqlMock }));

const named = (rows: TrafficRow[]) => rows.map((row) => (row.kind === "country" ? row.country : row.kind));

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
      { country: "NL", visits: 4 },
      { country: "DE", visits: 4 },
    ]);

    expect(named(summary.rows)).toEqual(["DE", "FR", "NL"]);
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
      { kind: "other", visits: MIN_COUNTRY_VISITS },
    ]);
    expect(JSON.stringify(summary)).not.toContain("KZ");
    expect(JSON.stringify(summary)).not.toContain("HU");
  });

  test("a lone tiny country can't show up as an 'other' row of one: the smallest named country joins it", () => {
    const summary = summarizeTraffic([
      { country: "US", visits: 20 },
      { country: "GB", visits: 5 },
      { country: "KZ", visits: 1 },
    ]);

    expect(summary.rows).toEqual([
      { kind: "country", country: "US", visits: 20 },
      { kind: "other", visits: 6 },
    ]);
    expect(summary.total).toBe(26);
  });

  test("no 'other' row is ever smaller than the minimum while a named country could absorb it", () => {
    for (const small of [1, 2]) {
      const { rows } = summarizeTraffic([
        { country: "US", visits: 9 },
        { country: "GB", visits: 3 },
        { country: "KZ", visits: small },
      ]);
      const other = rows.find((row) => row.kind === "other");
      expect(other?.visits ?? MIN_COUNTRY_VISITS).toBeGreaterThanOrEqual(MIN_COUNTRY_VISITS);
    }
  });

  test("when every country is below the minimum, everything is one 'other' row equal to the total", () => {
    const summary = summarizeTraffic([
      { country: "KZ", visits: 1 },
      { country: "HU", visits: 2 },
    ]);

    expect(summary.rows).toEqual([{ kind: "other", visits: 3 }]);
    expect(summary.total).toBe(3);
  });

  test("groups missing or malformed locations as unknown, before 'other'", () => {
    const summary = summarizeTraffic([
      { country: "US", visits: 9 },
      { country: null, visits: 2 },
      { country: "<script>", visits: 2 },
      { country: "KZ", visits: 3 },
    ]);

    expect(summary.rows).toEqual([
      { kind: "country", country: "US", visits: 9 },
      { kind: "country", country: "KZ", visits: 3 },
      { kind: "unknown", visits: 4 },
    ]);
    expect(summary.total).toBe(16);
  });

  test("unknown locations below the minimum fold into 'other' instead of standing alone", () => {
    const summary = summarizeTraffic([
      { country: "US", visits: 9 },
      { country: null, visits: 1 },
      { country: "KZ", visits: 2 },
    ]);

    expect(named(summary.rows)).toEqual(["US", "other"]);
    expect(summary.rows[1]).toEqual({ kind: "other", visits: 3 });
  });

  test("only unknown locations, above the minimum, is a single unknown row", () => {
    expect(summarizeTraffic([{ country: null, visits: 5 }])).toEqual({
      total: 5,
      rows: [{ kind: "unknown", visits: 5 }],
    });
  });

  test("an empty window is an empty summary, not an invented one", () => {
    expect(summarizeTraffic([])).toEqual({ total: 0, rows: [] });
  });

  test("merges spellings of one country before applying the minimum", () => {
    expect(
      summarizeTraffic([
        { country: "gb", visits: 2 },
        { country: "GB", visits: 2 },
      ]).rows,
    ).toEqual([{ kind: "country", country: "GB", visits: 4 }]);

    expect(
      summarizeTraffic([
        { country: "us", visits: 5 },
        { country: "US", visits: 5 },
      ]).rows,
    ).toEqual([{ kind: "country", country: "US", visits: 10 }]);
  });

  test("omits the 'other' and 'unknown' rows when they have nothing in them", () => {
    expect(named(summarizeTraffic([{ country: "US", visits: 5 }]).rows)).toEqual(["US"]);
  });
});

describe("formatShare", () => {
  test("uses one decimal below 10% and whole numbers from there", () => {
    expect(formatShare(75, 100)).toBe("75%");
    expect(formatShare(93, 1000)).toBe("9.3%");
    expect(formatShare(1, 3)).toBe("33%");
  });

  test("never rounds up into an inconsistent '10.0%'", () => {
    expect(formatShare(996, 10000)).toBe("10%");
  });

  test("labels slivers instead of showing 0.0%", () => {
    expect(formatShare(1, 5000)).toBe("<0.1%");
  });

  test("an empty total is 0%, not a division by zero", () => {
    expect(formatShare(0, 0)).toBe("0%");
  });
});

describe("getTrafficSummary", () => {
  afterEach(() => {
    sqlMock.mockReset();
  });

  test("groups by country over the fixed window and returns the summary", async () => {
    sqlMock.mockResolvedValueOnce([{ country: "US", visits: 12 }]);

    const summary = await getTrafficSummary();

    const [strings, ...values] = sqlMock.mock.calls[0];
    expect(strings.join("?")).toContain("GROUP BY country");
    expect(values).toEqual([TRAFFIC_WINDOW_DAYS]);
    expect(summary).toEqual({ total: 12, rows: [{ kind: "country", country: "US", visits: 12 }] });
  });
});
