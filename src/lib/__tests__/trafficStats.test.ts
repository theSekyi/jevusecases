import { afterEach, describe, expect, test, vi } from "vitest";
import {
  formatShare,
  getTrafficSummary,
  MIN_COUNTRY_VIEWS,
  MIN_COUNTRY_VISITORS,
  summarizeCountries,
  TRAFFIC_WINDOW_DAYS,
  type CountryCounts,
  type TrafficRow,
} from "../trafficStats";

const sqlMock = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => sqlMock }));

const counts = (country: string | null, views: number, visitors = 5): CountryCounts => ({ country, views, visitors });
const label = (rows: TrafficRow[]) => rows.map((row) => (row.kind === "country" ? row.country : row.kind));

describe("summarizeCountries", () => {
  test("ranks countries by page views, most first, with the total across all rows", () => {
    const summary = summarizeCountries([counts("US", 10, 4), counts("GB", 30, 9), counts("CA", 5, 2)]);

    expect(summary.rows).toEqual([
      { kind: "country", country: "GB", views: 30, visitors: 9 },
      { kind: "country", country: "US", views: 10, visitors: 4 },
      { kind: "country", country: "CA", views: 5, visitors: 2 },
    ]);
    expect(summary.views).toBe(45);
  });

  test("breaks ties by country code so the order is stable", () => {
    expect(label(summarizeCountries([counts("FR", 4), counts("NL", 4), counts("DE", 4)]).rows)).toEqual([
      "DE",
      "FR",
      "NL",
    ]);
  });

  test("folds countries below the minimum into one 'other' row, never naming them, and adds up their visitors", () => {
    const summary = summarizeCountries([
      counts("US", 20, 8),
      counts("KZ", 1, 1),
      counts("HU", MIN_COUNTRY_VIEWS - 1, 2),
      counts("SG", MIN_COUNTRY_VIEWS, 3),
    ]);

    expect(summary.rows).toEqual([
      { kind: "country", country: "US", views: 20, visitors: 8 },
      { kind: "country", country: "SG", views: MIN_COUNTRY_VIEWS, visitors: 3 },
      { kind: "other", views: MIN_COUNTRY_VIEWS, visitors: 3 },
    ]);
    expect(JSON.stringify(summary)).not.toContain("KZ");
    expect(JSON.stringify(summary)).not.toContain("HU");
  });

  test("a lone tiny country can't show up as an 'other' row of one: the smallest named country joins it", () => {
    const summary = summarizeCountries([counts("US", 20, 7), counts("GB", 5, 3), counts("KZ", 1, 1)]);

    expect(summary.rows).toEqual([
      { kind: "country", country: "US", views: 20, visitors: 7 },
      { kind: "other", views: 6, visitors: 4 },
    ]);
    expect(summary.views).toBe(26);
  });

  test("no 'other' row is ever smaller than the minimum while a named country could absorb it", () => {
    for (const small of [1, 2]) {
      const { rows } = summarizeCountries([counts("US", 9), counts("GB", 3), counts("KZ", small)]);
      const other = rows.find((row) => row.kind === "other");
      expect(other?.views ?? MIN_COUNTRY_VIEWS).toBeGreaterThanOrEqual(MIN_COUNTRY_VIEWS);
    }
  });

  test("when every country is below the minimum, everything is one 'other' row equal to the total", () => {
    const summary = summarizeCountries([counts("KZ", 1, 1), counts("HU", 2, 1)]);

    expect(summary.rows).toEqual([{ kind: "other", views: 3, visitors: 2 }]);
    expect(summary.views).toBe(3);
  });

  test("a country whose views come from a single visitor is folded, however many views that is", () => {
    const summary = summarizeCountries([counts("US", 20, 6), counts("DE", 30, MIN_COUNTRY_VISITORS - 1), counts("FR", 10, 3)]);

    expect(label(summary.rows)).toEqual(["US", "other"]);
    expect(summary.rows[1]).toMatchObject({ kind: "other", views: 40, visitors: 4 });
  });

  test("an 'other' row that is one visitor absorbs the smallest named country so it isn't one person", () => {
    const summary = summarizeCountries([counts("US", 20, 6), counts("GB", 9, 3), counts("DE", 4, 1)]);

    expect(label(summary.rows)).toEqual(["US", "other"]);
    expect(summary.rows[1]).toMatchObject({ views: 13, visitors: 4 });
  });

  test("views without identities (visitors 0) are judged on views alone", () => {
    expect(label(summarizeCountries([counts("US", 20, 0), counts("DE", 5, 0)]).rows)).toEqual(["US", "DE"]);
  });

  test("groups missing or malformed locations as unknown, before 'other'", () => {
    const summary = summarizeCountries([
      counts("US", 9),
      counts(null, 2),
      counts("<script>", 2),
      counts("KZ", 3),
    ]);

    expect(summary.rows).toEqual([
      { kind: "country", country: "US", views: 9, visitors: 5 },
      { kind: "country", country: "KZ", views: 3, visitors: 5 },
      { kind: "unknown", views: 4, visitors: 10 },
    ]);
    expect(summary.views).toBe(16);
  });

  test("unknown locations below the minimum fold into 'other' instead of standing alone", () => {
    const summary = summarizeCountries([counts("US", 9), counts(null, 1), counts("KZ", 2)]);

    expect(label(summary.rows)).toEqual(["US", "other"]);
    expect(summary.rows[1]).toMatchObject({ kind: "other", views: 3 });
  });

  test("only unknown locations, above the minimum, is a single unknown row", () => {
    expect(summarizeCountries([counts(null, 5, 2)])).toEqual({
      views: 5,
      rows: [{ kind: "unknown", views: 5, visitors: 2 }],
    });
  });

  test("an empty window is an empty summary, not an invented one", () => {
    expect(summarizeCountries([])).toEqual({ views: 0, rows: [] });
  });

  test("merges spellings of one country before applying the minimum", () => {
    expect(summarizeCountries([counts("gb", 2, 1), counts("GB", 2, 1)]).rows).toEqual([
      { kind: "country", country: "GB", views: 4, visitors: 2 },
    ]);
    expect(summarizeCountries([counts("us", 5), counts("US", 5)]).rows).toEqual([
      { kind: "country", country: "US", views: 10, visitors: 10 },
    ]);
  });

  test("omits the 'other' and 'unknown' rows when they have nothing in them", () => {
    expect(label(summarizeCountries([counts("US", 5)]).rows)).toEqual(["US"]);
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

  test("combines per-country counts with overall unique and returning visitors for the fixed window", async () => {
    sqlMock
      .mockResolvedValueOnce([{ country: "US", views: 12, visitors: 5 }])
      .mockResolvedValueOnce([{ visitors: 9, returning: 3 }]);

    const summary = await getTrafficSummary();

    expect(summary).toEqual({
      views: 12,
      visitors: 9,
      returning: 3,
      rows: [{ kind: "country", country: "US", views: 12, visitors: 5 }],
    });
    for (const [strings, ...values] of sqlMock.mock.calls) {
      expect(strings.join("?")).toContain("visitor_events");
      expect(values).toEqual([TRAFFIC_WINDOW_DAYS]);
    }
  });

  test("overall visitors are counted across countries, not summed from country rows", async () => {
    sqlMock
      .mockResolvedValueOnce([
        { country: "US", views: 5, visitors: 1 },
        { country: "GB", views: 5, visitors: 1 },
      ])
      .mockResolvedValueOnce([{ visitors: 1, returning: 1 }]);

    const summary = await getTrafficSummary();

    expect(summary.visitors).toBe(1);
    expect(summary.returning).toBe(1);
  });

  test("returning visitors are those seen on more than one day, and only hashed visits count", async () => {
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([{ visitors: 0, returning: 0 }]);

    await getTrafficSummary();

    const totals = sqlMock.mock.calls[1][0].join("?");
    expect(totals).toContain("visitor_hash IS NOT NULL");
    expect(totals).toContain("AT TIME ZONE 'UTC'");
    expect(totals).toContain("days > 1");
  });
});
