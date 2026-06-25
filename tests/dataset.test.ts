import { expect, test } from "bun:test";

import { loadDataset } from "../src/batch.ts";

test("dataset has 50 unique queries", () => {
  const rows = loadDataset("data/queries.jsonl");
  expect(rows.length).toBe(50);
  expect(new Set(rows.map((r) => r.id)).size).toBe(50);
  expect(rows.every((r) => r.query.endsWith("?"))).toBe(true);
  expect(rows.every((r) => r.category.length > 0)).toBe(true);
});
