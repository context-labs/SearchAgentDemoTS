import { expect, test } from "bun:test";
import { RunContext } from "@openai/agents";

import { Scratchpad } from "../src/models.ts";
import { MockSearchClient } from "../src/searchClients.ts";
import { buildTools } from "../src/tools.ts";

function toolByName(tools: ReturnType<typeof buildTools>, name: string) {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`tool not found: ${name}`);
  return found;
}

async function invoke(tool: ReturnType<typeof buildTools>[number], payload: string): Promise<string> {
  // FunctionTool.invoke parses the JSON payload against the zod schema and runs execute.
  const result = await (tool as any).invoke(new RunContext(), payload);
  return String(result);
}

test("mock search client is deterministic", async () => {
  const client = new MockSearchClient();
  const first = await client.search({ query: "test query", maxResults: 2 });
  const second = await client.search({ query: "test query", maxResults: 2 });
  expect(first).toEqual(second);
  expect(first.results.length).toBe(2);
});

test("scratchpad tool writes and reads", async () => {
  const scratchpad = new Scratchpad();
  const tools = buildTools({ searchClient: new MockSearchClient(), scratchpad, tracing: null });
  const writeTool = toolByName(tools, "scratchpad_write");
  const readTool = toolByName(tools, "scratchpad_read");

  const writeResult = JSON.parse(await invoke(writeTool, '{"note":"check dates","label":"plan"}'));
  const readResult = JSON.parse(await invoke(readTool, '{"limit":5}'));

  expect(writeResult.ok).toBe(true);
  expect(readResult.notes[0].note).toBe("check dates");
});

test("source assessment penalizes blog", async () => {
  const tools = buildTools({
    searchClient: new MockSearchClient(),
    scratchpad: new Scratchpad(),
    tracing: null,
  });
  const assessTool = toolByName(tools, "assess_source");
  const result = JSON.parse(
    await invoke(
      assessTool,
      JSON.stringify({
        url: "https://vendor.example.com/blog/post",
        title: "Vendor view",
        snippet: "A sponsored post",
      }),
    ),
  );
  expect(result.quality_score).toBeLessThan(0.45);
});
