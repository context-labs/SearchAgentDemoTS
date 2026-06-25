import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { agentSpan } from "@inference/tracing";
import { run } from "@openai/agents";

import { buildAgent } from "./agent.ts";
import { loadSettings } from "./config.ts";
import { MockSearchClient } from "./searchClients.ts";
import { setupTracing } from "./tracing.ts";

export interface DatasetRow {
  id: string;
  category: string;
  query: string;
}

export function loadDataset(path: string): DatasetRow[] {
  const rows: DatasetRow[] = [];
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const row = JSON.parse(line);
    if (
      typeof row.id !== "string" ||
      typeof row.category !== "string" ||
      typeof row.query !== "string"
    ) {
      throw new Error(`Invalid dataset row at line ${index + 1}: ${line}`);
    }
    rows.push(row as DatasetRow);
  });
  return rows;
}

function clampTurns(value: number): number {
  return Math.max(2, Math.min(value, 20));
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      dataset: { type: "string", default: "data/queries.jsonl" },
      limit: { type: "string", default: "3" },
      start: { type: "string", default: "0" },
      "user-id": { type: "string", default: "demo-batch-user" },
      "max-turns": { type: "string", default: "10" },
      "mock-search": { type: "boolean", default: false },
    },
  });

  const datasetPath = values.dataset as string;
  const limit = Math.max(1, Number(values.limit));
  const start = Math.max(0, Number(values.start));
  const userId = values["user-id"] as string;
  const maxTurns = clampTurns(Number(values["max-turns"]));
  const mockSearch = values["mock-search"] as boolean;

  const settings = loadSettings();
  const rows = loadDataset(datasetPath).slice(start, start + limit);
  const tracing = await setupTracing();

  try {
    for (const row of rows) {
      const sessionId = `dataset-${row.id}`;
      const searchClient = mockSearch ? new MockSearchClient() : undefined;
      const { agent } = buildAgent({ settings, searchClient, tracing });

      let finalOutput = "";
      await agentSpan(
        {
          agentId: "traceable-search-agent",
          agentName: "Traceable Search Agent",
          spanName: "traceable-search-agent.dataset_run",
          sessionId,
          userId,
          role: "search",
          system: "openai",
        },
        async (span) => {
          span.setInput(row.query);
          span.setAttribute("demo.dataset", "queries.jsonl");
          span.setAttribute("demo.query_id", row.id);
          span.setAttribute("demo.category", row.category);
          span.setAttribute("search.mock", mockSearch);
          const result = await run(agent, row.query, { maxTurns });
          finalOutput = String(result.finalOutput ?? "");
          span.setOutput(finalOutput);
        },
      );

      console.log(`\n=== ${row.id} ===`);
      console.log(finalOutput);
    }
  } finally {
    await tracing.shutdown();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
