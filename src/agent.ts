import { Agent, setDefaultOpenAIClient, setOpenAIAPI } from "@openai/agents";
import OpenAI from "openai";

import type { Settings } from "./config.ts";
import { Scratchpad } from "./models.ts";
import { MockSearchClient, type SearchClient, TavilySearchClient } from "./searchClients.ts";
import { buildTools } from "./tools.ts";
import type { Tracing } from "./tracing.ts";

export const AGENT_INSTRUCTIONS = `You are TraceableSearchAgent, a compact web-search agent built for HALO trace analysis.

Operating loop:
1. Write a short plan to scratchpad_write before searching.
2. Use one or two focused web_search calls. Avoid broad repeated searches.
3. Assess one to three high-value sources with assess_source.
4. Extract one page when a snippet is not enough to support a claim.
5. Use scratchpad_read before the final answer if you wrote more than one note.
6. Prefer a useful final answer over exhausting the turn budget.

Final answer requirements:
- Give a concise answer first.
- Include a "Sources consulted" section with source titles or URLs.
- Include an "Uncertainties" section when evidence is thin, stale, or conflicting.
- Do not claim certainty from snippets alone.

Known rough edges for HALO:
- Source quality is heuristic and can be wrong.
- The scratchpad is unstructured and can accumulate stale notes.
- There is no enforced final response schema.
- Date handling is mostly delegated to the model.`;

let modelProviderConfigured = false;

/**
 * Point the Agents SDK's OpenAI client at the Inference LiteLLM gateway. The
 * gateway is OpenAI chat-completions compatible, so this is all that's needed
 * to route the agent's model calls through it (same env vars as the Python
 * repo's LitellmModel). Idempotent.
 */
function configureModelProvider(settings: Settings): void {
  if (modelProviderConfigured) return;
  setDefaultOpenAIClient(
    new OpenAI({
      apiKey: settings.litellmApiKey,
      baseURL: settings.litellmBaseUrl,
    }),
  );
  setOpenAIAPI("chat_completions");
  modelProviderConfigured = true;
}

export function buildAgent({
  settings,
  searchClient,
  tracing,
}: {
  settings: Settings;
  searchClient?: SearchClient;
  tracing: Tracing | null;
}): { agent: Agent; scratchpad: Scratchpad } {
  configureModelProvider(settings);

  const scratchpad = new Scratchpad();
  const resolvedSearchClient =
    searchClient ??
    (settings.tavilyApiKey
      ? new TavilySearchClient(settings.tavilyApiKey)
      : new MockSearchClient());

  const tools = buildTools({
    searchClient: resolvedSearchClient,
    scratchpad,
    tracing,
    maxToolResults: settings.maxToolResults,
    maxExtractChars: settings.maxExtractChars,
  });

  const agent = new Agent({
    name: "TraceableSearchAgent",
    instructions: AGENT_INSTRUCTIONS,
    model: settings.litellmModelId,
    tools,
  });

  return { agent, scratchpad };
}
