export interface Settings {
  litellmBaseUrl: string;
  litellmApiKey: string;
  litellmModelId: string;
  tavilyApiKey: string | undefined;
  inferenceNetApiKey: string | undefined;
  catalystEndpoint: string;
  catalystServiceName: string;
  maxToolResults: number;
  maxExtractChars: number;
}

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
 * Mirrors the Python load_settings(): copies INFERENCE_NET_API_KEY into
 * CATALYST_OTLP_TOKEN when that is not set, and defaults the Catalyst endpoint
 * and service name.
 */
export function loadSettings(): Settings {
  const inferenceKey = process.env.INFERENCE_NET_API_KEY;
  const catalystToken = process.env.CATALYST_OTLP_TOKEN || inferenceKey;
  if (catalystToken) {
    setDefault("CATALYST_OTLP_TOKEN", catalystToken);
  }

  setDefault("CATALYST_OTLP_ENDPOINT", "https://telemetry.inference.net");
  setDefault("CATALYST_SERVICE_NAME", "halo-search-agent-example");

  return {
    litellmBaseUrl: requireEnv("LITELLM_BASE_URL"),
    litellmApiKey: requireEnv("LITELLM_API_KEY"),
    litellmModelId: requireEnv("LITELLM_MODEL_ID"),
    tavilyApiKey: process.env.TAVILY_API_KEY,
    inferenceNetApiKey: inferenceKey,
    catalystEndpoint: process.env.CATALYST_OTLP_ENDPOINT as string,
    catalystServiceName: process.env.CATALYST_SERVICE_NAME as string,
    maxToolResults: 5,
    maxExtractChars: 6000,
  };
}
