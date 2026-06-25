import { tool } from "@openai/agents";
import { z } from "zod";

import type { Scratchpad } from "./models.ts";
import type { SearchClient } from "./searchClients.ts";
import { maybeManualSpan, type Tracing } from "./tracing.ts";

export interface BuildToolsOptions {
  searchClient: SearchClient;
  scratchpad: Scratchpad;
  tracing: Tracing | null;
  maxToolResults?: number;
  maxExtractChars?: number;
}

export function buildTools({
  searchClient,
  scratchpad,
  tracing,
  maxToolResults = 5,
  maxExtractChars = 6000,
}: BuildToolsOptions) {
  const scratchpadWrite = tool({
    name: "scratchpad_write",
    description:
      "Store a short planning note, source observation, or uncertainty for this run.",
    parameters: z.object({
      note: z.string(),
      label: z.string().nullable(),
    }),
    execute: async ({ note, label }) => {
      const entry = scratchpad.write(note, label ?? "note");
      return JSON.stringify({ ok: true, entry, total_notes: scratchpad.notes.length });
    },
  });

  const scratchpadRead = tool({
    name: "scratchpad_read",
    description: "Read recent notes written to the scratchpad during this run.",
    parameters: z.object({
      limit: z.number().nullable(),
    }),
    execute: async ({ limit }) => {
      return JSON.stringify({ notes: scratchpad.read(limit ?? 10) });
    },
  });

  const webSearch = tool({
    name: "web_search",
    description: "Search the web for sources. Use sparingly and prefer focused queries.",
    parameters: z.object({
      query: z.string(),
      max_results: z.number().nullable(),
      include_answer: z.boolean().nullable(),
      topic: z.string().nullable(),
    }),
    execute: async ({ query, max_results, include_answer, topic }) => {
      const cappedResults = Math.min(Math.max(1, max_results ?? 5), maxToolResults);
      const includeAnswer = include_answer ?? false;
      const searchTopic = topic ?? "general";
      const response = await maybeManualSpan(
        tracing,
        {
          name: "tavily.search",
          spanKindName: "RETRIEVER",
          input: {
            query,
            max_results: cappedResults,
            include_answer: includeAnswer,
            topic: searchTopic,
          },
        },
        async (span) => {
          const result = await searchClient.search({
            query,
            maxResults: cappedResults,
            includeAnswer,
            topic: searchTopic,
          });
          if (span) {
            span.setOutput({
              result_count: result.results.length,
              urls: result.results.map((item) => item.url),
            });
          }
          return result;
        },
      );
      return JSON.stringify(response);
    },
  });

  const extractPage = tool({
    name: "extract_page",
    description: "Extract readable content from a URL returned by search.",
    parameters: z.object({
      url: z.string(),
      query: z.string().nullable(),
    }),
    execute: async ({ url, query }) => {
      const response = await maybeManualSpan(
        tracing,
        {
          name: "tavily.extract",
          spanKindName: "RETRIEVER",
          input: { url, query, max_chars: maxExtractChars },
        },
        async (span) => {
          const result = await searchClient.extract({ url, query, maxChars: maxExtractChars });
          if (span) {
            span.setOutput({
              url: result.url,
              content_chars: String(result.raw_content ?? "").length,
              truncated: result.truncated,
            });
          }
          return result;
        },
      );
      return JSON.stringify(response);
    },
  });

  const assessSource = tool({
    name: "assess_source",
    description: "Apply a simple source-quality heuristic to a result.",
    parameters: z.object({
      url: z.string(),
      title: z.string().nullable(),
      snippet: z.string().nullable(),
    }),
    execute: async ({ url, title, snippet }) => {
      const host = safeHostname(url);
      const text = (snippet ?? "").toLowerCase();
      let score = 0.45;
      const reasons: string[] = [];

      if (host.endsWith(".gov") || host.includes(".gov.")) {
        score += 0.35;
        reasons.push("government domain");
      }
      if (host.endsWith(".edu") || host.includes(".edu.")) {
        score += 0.25;
        reasons.push("education domain");
      }
      if (["nature.com", "science.org", "who.int", "oecd.org"].some((t) => host.includes(t))) {
        score += 0.25;
        reasons.push("recognized institutional source");
      }
      if (["blog", "medium.com", "substack.com"].some((t) => host.includes(t))) {
        score -= 0.15;
        reasons.push("commentary or blog-like source");
      }
      if (text.includes("sponsored") || text.includes("press release")) {
        score -= 0.15;
        reasons.push("possible promotional framing");
      }

      score = Math.round(Math.max(0, Math.min(score, 1)) * 100) / 100;
      return JSON.stringify({
        url,
        title: title ?? "",
        quality_score: score,
        reasons: reasons.length > 0 ? reasons : ["generic domain heuristic only"],
      });
    },
  });

  const compareClaims = tool({
    name: "compare_claims",
    description: "Compare two short claims and classify their relationship.",
    parameters: z.object({
      claim_a: z.string(),
      claim_b: z.string(),
    }),
    execute: async ({ claim_a, claim_b }) => {
      const a = claim_a.toLowerCase().trim();
      const b = claim_b.toLowerCase().trim();
      const wordsA = new Set(a.split(/\s+/).filter(Boolean));
      const wordsB = new Set(b.split(/\s+/).filter(Boolean));
      const overlap = [...wordsA].filter((w) => wordsB.has(w)).sort();

      let relationship: string;
      if (a === b) {
        relationship = "same";
      } else if (overlap.length >= Math.max(3, Math.floor(Math.min(wordsA.size, wordsB.size) / 2))) {
        relationship = "related";
      } else {
        relationship = "unclear";
      }
      return JSON.stringify({
        relationship,
        shared_terms: overlap.slice(0, 12),
        warning: "Lexical comparison only. This can miss semantic agreement or conflict.",
      });
    },
  });

  return [
    scratchpadWrite,
    scratchpadRead,
    webSearch,
    extractPage,
    assessSource,
    compareClaims,
  ];
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}
