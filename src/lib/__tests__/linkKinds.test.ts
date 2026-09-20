import { describe, expect, test } from "vitest";
import { isLinkKind, LINK_KIND_LABELS, LINK_KINDS, OUTGOING_KINDS, takesProject } from "../linkKinds";

describe("linkKinds", () => {
  test("accepts exactly the listed kinds", () => {
    for (const kind of LINK_KINDS) expect(isLinkKind(kind)).toBe(true);
    for (const other of ["", "Source", "source ", "__proto__", "constructor", "toString", null, undefined, 3, {}]) {
      expect(isLinkKind(other)).toBe(false);
    }
  });

  test("every kind has a label for the panel", () => {
    expect(Object.keys(LINK_KIND_LABELS).sort()).toEqual([...LINK_KINDS].sort());
  });

  test("the kinds that belong to a project need one, and the site-wide kinds never carry one", () => {
    expect(LINK_KINDS.filter(takesProject).sort()).toEqual(
      ["author", "copy_install", "copy_link", "project_open", "share_x", "source", "tweet"].sort(),
    );
    expect(takesProject("submit")).toBe(false);
    expect(takesProject("footer_repo")).toBe(false);
  });

  test("outgoing links are a subset of the kinds", () => {
    for (const kind of OUTGOING_KINDS) expect(isLinkKind(kind)).toBe(true);
  });
});
