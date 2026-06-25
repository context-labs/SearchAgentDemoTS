import { tavily, type TavilyClient } from "@tavily/core";

import { SearchResult, type SearchResultData } from "./models.ts";

export interface SearchResponse {
  query: string | null;
  answer: string | null;
  results: SearchResultData[];
}

export interface ExtractResponse {
  url: string;
  raw_content: string;
  truncated: boolean;
}

export interface SearchClient {
  search(args: {
    query: string;
    maxResults?: number;
    includeAnswer?: boolean;
    topic?: string;
  }): Promise<SearchResponse>;

  extract(args: {
    url: string;
    query?: string | null;
    maxChars?: number;
  }): Promise<ExtractResponse>;
}

function normalizeSearchResponse(response: any): SearchResponse {
  const results: SearchResultData[] = (response?.results ?? []).map((item: any) =>
    new SearchResult(
      String(item?.title ?? ""),
      String(item?.url ?? ""),
      String(item?.content ?? ""),
      item?.score ?? null,
      item?.publishedDate ?? item?.published_date ?? null,
    ).toDict(),
  );
  return {
    query: response?.query ?? null,
    answer: response?.answer ?? null,
    results,
  };
}

export class TavilySearchClient implements SearchClient {
  private client: TavilyClient;

  constructor(apiKey: string) {
    this.client = tavily({ apiKey });
  }

  async search({
    query,
    maxResults = 5,
    includeAnswer = false,
    topic = "general",
  }: {
    query: string;
    maxResults?: number;
    includeAnswer?: boolean;
    topic?: string;
  }): Promise<SearchResponse> {
    const response = await this.client.search(query, {
      maxResults: Math.max(1, Math.min(maxResults, 8)),
      includeAnswer,
      searchDepth: "basic",
      topic: topic as "general" | "news" | "finance",
    });
    return normalizeSearchResponse(response);
  }

  async extract({
    url,
    query = null,
    maxChars = 6000,
  }: {
    url: string;
    query?: string | null;
    maxChars?: number;
  }): Promise<ExtractResponse> {
    const response = await this.client.extract([url], {
      extractDepth: "basic",
      format: "markdown",
    });
    const results = response?.results ?? [];
    if (results.length === 0) {
      return { url, raw_content: "", truncated: false };
    }
    const rawContent = String(results[0]?.rawContent ?? "");
    const truncated = rawContent.length > maxChars;
    return {
      url: results[0]?.url ?? url,
      raw_content: rawContent.slice(0, maxChars),
      truncated,
    };
  }
}

/** Deterministic, network-free search results for smoke tests and CI. */
export class MockSearchClient implements SearchClient {
  async search({
    query,
    maxResults = 5,
    includeAnswer = false,
  }: {
    query: string;
    maxResults?: number;
    includeAnswer?: boolean;
    topic?: string;
  }): Promise<SearchResponse> {
    const all = [
      new SearchResult(
        "Example government source",
        "https://example.gov/report",
        `A public agency report says the query needs current source checking and careful date handling: ${query}.`,
        0.91,
        "2026-02-12",
      ),
      new SearchResult(
        "Example analyst note",
        "https://example.org/analysis",
        "An analyst note gives context, but it is not a primary source and may need corroboration.",
        0.74,
        "2025-11-01",
      ),
      new SearchResult(
        "Example vendor blog",
        "https://example.com/blog",
        "A vendor blog frames the topic optimistically and should be treated as lower confidence evidence.",
        0.62,
        null,
      ),
    ];
    const results = all.slice(0, Math.max(1, Math.min(maxResults, 8)));
    return {
      query,
      answer: includeAnswer ? "Mock answer generated without calling Tavily." : null,
      results: results.map((result) => result.toDict()),
    };
  }

  async extract({
    url,
    maxChars = 6000,
  }: {
    url: string;
    query?: string | null;
    maxChars?: number;
  }): Promise<ExtractResponse> {
    const content =
      `# Mock extracted page\n\nURL: ${url}\n\n` +
      "This deterministic page content is used for tests and local demos. " +
      "It intentionally includes enough text for the agent to summarize while " +
      "avoiding network usage.";
    return { url, raw_content: content.slice(0, maxChars), truncated: false };
  }
}
