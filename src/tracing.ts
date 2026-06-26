import { manualSpan, setup, SpanKindValues } from "@inference/tracing";
import * as agents from "@openai/agents";
import { setTracingDisabled } from "@openai/agents";
import OpenAI from "openai";

export type Tracing = Awaited<ReturnType<typeof setup>>;

/**
 * Initialize Catalyst tracing. In TypeScript the SDK modules are passed
 * explicitly (Python auto-detects). Catalyst captures the trace tree by patching
 * the underlying OpenAI client (model calls) plus the agentSpan() wrapper and the
 * manual RETRIEVER spans below — it does not use the Agents SDK's own tracing.
 *
 * So we disable the Agents SDK's built-in tracing: otherwise it tries to export
 * to OpenAI's hosted trace backend and logs "No API key provided for OpenAI
 * tracing exporter" on every run. (The Python repo does the equivalent by
 * dropping the SDK's default trace processor.)
 */
export async function setupTracing(): Promise<Tracing> {
  const tracing = await setup({
    modules: { openai: OpenAI, openaiAgents: agents },
  });
  setTracingDisabled(true);
  return tracing;
}

export interface ManualSpan {
  setOutput(output: unknown): void;
}

/**
 * Author a manual RETRIEVER/CHAIN span around work the Agents SDK never sees
 * (the Tavily search and extract calls inside tools). When tracing is disabled
 * (tests, mock smoke runs without setup) it just runs the callback.
 */
export async function maybeManualSpan<T>(
  tracing: Tracing | null,
  opts: {
    name: string;
    spanKindName: keyof typeof SpanKindValues;
    input?: Record<string, unknown>;
  },
  fn: (span: ManualSpan | null) => Promise<T>,
): Promise<T> {
  if (!tracing) {
    return fn(null);
  }
  return manualSpan(
    {
      spanName: opts.name,
      spanKind: SpanKindValues[opts.spanKindName],
      input: opts.input ?? {},
    },
    async (span) => fn(span),
  );
}
