import { manualSpan, setup, SpanKindValues } from "@inference/tracing";
import * as agents from "@openai/agents";
import OpenAI from "openai";

export type Tracing = Awaited<ReturnType<typeof setup>>;

/**
 * Initialize Catalyst tracing. In TypeScript the SDK modules are passed
 * explicitly (Python auto-detects). Passing the @openai/agents module wires the
 * Agents SDK instrumentation so agent runs, model calls, and tool calls are
 * captured and exported to Catalyst rather than OpenAI's hosted trace backend.
 */
export async function setupTracing(): Promise<Tracing> {
  return await setup({
    modules: { openai: OpenAI, openaiAgents: agents },
  });
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
