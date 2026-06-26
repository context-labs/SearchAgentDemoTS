export interface Settings {
  inferenceApiKey: string;
  inferenceBaseUrl: string;
  modelId: string;
  tavilyApiKey: string | undefined;
  catalystEndpoint: string;
  catalystServiceName: string;
  maxToolResults: number;
  maxExtractChars: number;
}

const DEFAULT_MODEL_ID = "gpt-4.1-mini";
const DEFAULT_BASE_URL = "https://api.inference.net/v1";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function setDefault(name: string, value: string): void {
  if (!process.env[name]) {
    process.env[name] = value;
  }
}

/**
 * Bun auto-loads .env, so by the time this runs the variables are present.
 *
 * A single INFERENCE_API_KEY powers everything: the agent's model calls (through
 * the OpenAI-compatible endpoint at api.inference.net) and tracing (it is copied
 * into CATALYST_OTLP_TOKEN when that is not already set). The Catalyst endpoint
 * and service name default the same way.
 */
export function loadSettings(): Settings {
  const inferenceApiKey = requireEnv("INFERENCE_API_KEY");

  setDefault("CATALYST_OTLP_TOKEN", inferenceApiKey);
  setDefault("CATALYST_OTLP_ENDPOINT", "https://telemetry.inference.net");
  setDefault("CATALYST_SERVICE_NAME", "halo-search-agent-example");

  return {
    inferenceApiKey,
    inferenceBaseUrl: process.env.INFERENCE_BASE_URL || DEFAULT_BASE_URL,
    modelId: process.env.MODEL_ID || DEFAULT_MODEL_ID,
    tavilyApiKey: process.env.TAVILY_API_KEY,
    catalystEndpoint: process.env.CATALYST_OTLP_ENDPOINT as string,
    catalystServiceName: process.env.CATALYST_SERVICE_NAME as string,
    maxToolResults: 5,
    maxExtractChars: 6000,
  };
}
