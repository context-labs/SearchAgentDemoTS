import { parseArgs } from "node:util";

import { agentSpan } from "@inference/tracing";
import { run } from "@openai/agents";

import { buildAgent } from "./agent.ts";
import { loadSettings } from "./config.ts";
import { MockSearchClient } from "./searchClients.ts";
import { setupTracing } from "./tracing.ts";

function clampTurns(value: number): number {
  return Math.max(2, Math.min(value, 20));
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      "session-id": { type: "string" },
      "user-id": { type: "string", default: "demo-user" },
      "max-turns": { type: "string", default: "10" },
      "mock-search": { type: "boolean", default: false },
    },
  });

  const query = positionals[0];
  if (!query) {
    console.error('Usage: bun run search-agent "<query>" [--mock-search] [--session-id ID]');
    process.exit(1);
  }

  const userId = values["user-id"] as string;
  const maxTurns = clampTurns(Number(values["max-turns"]));
  const mockSearch = values["mock-search"] as boolean;
  const sessionId = (values["session-id"] as string) || `search-demo-${crypto.randomUUID()}`;

  const settings = loadSettings();
  const tracing = await setupTracing();
  const searchClient = mockSearch ? new MockSearchClient() : undefined;

  try {
    const { agent } = buildAgent({ settings, searchClient, tracing });

    let finalOutput = "";
    await agentSpan(
      {
        agentId: "traceable-search-agent",
        agentName: "Traceable Search Agent",
        spanName: "traceable-search-agent.run",
        sessionId,
        userId,
        role: "search",
        system: "openai",
      },
      async (span) => {
        span.setInput(query);
        span.setAttribute("demo.dataset", "manual");
        span.setAttribute("search.mock", mockSearch);
        const result = await run(agent, query, { maxTurns });
        finalOutput = String(result.finalOutput ?? "");
        span.setOutput(finalOutput);
      },
    );

    console.log(finalOutput);
    console.log(`\nsession_id=${sessionId}`);
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
