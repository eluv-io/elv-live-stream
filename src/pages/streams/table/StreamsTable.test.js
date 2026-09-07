import {describe, it, expect} from "vitest";
import {BuildGroupedRows} from "./groupedRows.js";

const rec = (objectId, extra = {}) => ({objectId, slug: objectId, title: objectId, date: "2026-08-28", ...extra});
const label = r => r._type === "group" ? `group:${r.titleId}` : `${r._type ?? "row"}:${r.objectId}`;
const orderOf = (...ids) => new Map(ids.map((id, i) => [id, i]));

describe("BuildGroupedRows", () => {
  it("returns the same records array when there are no real groups", () => {
    const records = [rec("a"), rec("b")];
    expect(BuildGroupedRows({records, groups: []})).toBe(records);
    expect(BuildGroupedRows({records, groups: [{titleId: "t", streamIds: []}]})).toBe(records);
  });

  it("collapses a group to one row with the visible member count", () => {
    const records = [rec("a"), rec("g1"), rec("c"), rec("g2")];
    const groups = [{titleId: "grp", streamIds: ["g1", "g2"]}];
    const streamOrder = orderOf("a", "g1", "c", "g2");

    const rows = BuildGroupedRows({records, groups, expandedGroups: [], streamOrder});

    expect(rows.map(label)).toEqual(["row:a", "group:grp", "row:c"]);
    expect(rows.find(r => r._type === "group").streamCount).toBe(2);
  });

  it("keeps a group row anchored to its first member even when that member is filtered out", () => {
    const groups = [{titleId: "grp", streamIds: ["g_first", "g_last"]}];
    // Full order: the group's first member is at the very top, the last at the very bottom.
    const streamOrder = orderOf("g_first", "s2", "s3", "s4", "g_last");

    // Unfiltered: group sits first.
    const full = BuildGroupedRows({
      records: [rec("g_first"), rec("s2"), rec("s3"), rec("s4"), rec("g_last")],
      groups, expandedGroups: [], streamOrder
    });
    expect(full.map(label)).toEqual(["group:grp", "row:s2", "row:s3", "row:s4"]);

    // Filter hides g_first (only g_last survives) - group MUST NOT jump to the bottom.
    const filtered = BuildGroupedRows({
      records: [rec("s2"), rec("s3"), rec("s4"), rec("g_last")],
      groups, expandedGroups: [], streamOrder
    });
    expect(filtered.map(label)).toEqual(["group:grp", "row:s2", "row:s3", "row:s4"]);
    expect(filtered.find(r => r._type === "group").streamCount).toBe(1);
  });

  it("orders multiple groups by their first member and keeps that order under filtering", () => {
    const groups = [
      {titleId: "g1", streamIds: ["a1", "a2"]},
      {titleId: "g2", streamIds: ["b1", "b2"]},
      {titleId: "g3", streamIds: ["c1", "c2"]}
    ];
    const streamOrder = orderOf("a1", "b1", "c1", "a2", "b2", "c2");

    // Only the trailing member of each group survives the filter.
    const rows = BuildGroupedRows({
      records: [rec("a2"), rec("b2"), rec("c2")],
      groups, expandedGroups: [], streamOrder
    });

    expect(rows.map(label)).toEqual(["group:g1", "group:g2", "group:g3"]);
  });

  it("emits expanded group members as children right after the group row", () => {
    const records = [rec("a"), rec("g1"), rec("g2"), rec("z")];
    const groups = [{titleId: "grp", streamIds: ["g1", "g2"]}];
    const streamOrder = orderOf("a", "g1", "g2", "z");

    const rows = BuildGroupedRows({records, groups, expandedGroups: ["grp"], streamOrder});

    expect(rows.map(label)).toEqual(["row:a", "group:grp", "groupChild:g1", "groupChild:g2", "row:z"]);
  });

  it("falls back to records order when no streamOrder is supplied", () => {
    const records = [rec("a"), rec("g1"), rec("b")];
    const groups = [{titleId: "grp", streamIds: ["g1"]}];

    const rows = BuildGroupedRows({records, groups, expandedGroups: []});

    expect(rows.map(label)).toEqual(["row:a", "group:grp", "row:b"]);
  });
});
