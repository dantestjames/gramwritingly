export interface Config {
  port: number;
  webOrigin: string;
  jwtSecret: string;
  databasePath: string;
  languageToolUrl: string;
  defaultLanguage: string;
  anthropicApiKey: string;
  claudeFastModel: string;
  claudeDeepModel: string;
  plagiarismProvider: "copyleaks" | "none";
  copyleaksEmail: string;
  copyleaksApiKey: string;
  /** Public URL of this API, used for plagiarism webhooks. */
  publicApiUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const jwtSecret = env.JWT_SECRET ?? "";
  if (env.NODE_ENV === "production" && (jwtSecret.length < 32 || jwtSecret.startsWith("change-me"))) {
    throw new Error("JWT_SECRET must be set to a random string of 32+ characters in production.");
  }
  return {
    port: Number(env.PORT ?? 8787),
    webOrigin: env.WEB_ORIGIN ?? "http://localhost:5173",
    jwtSecret: jwtSecret || "dev-only-secret-do-not-use-in-production",
    databasePath: env.DATABASE_PATH ?? "./data/gramwritingly.db",
    languageToolUrl: (env.LANGUAGETOOL_URL ?? "http://localhost:8010").replace(/\/$/, ""),
    defaultLanguage: env.DEFAULT_LANGUAGE ?? "en-AU",
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? "",
    claudeFastModel: env.CLAUDE_FAST_MODEL ?? "claude-haiku-5-5",
    claudeDeepModel: env.CLAUDE_DEEP_MODEL ?? "claude-sonnet-5-5",
    plagiarismProvider: env.PLAGIARISM_PROVIDER === "copyleaks" ? "copyleaks" : "none",
    copyleaksEmail: env.COPYLEAKS_EMAIL ?? "",
    copyleaksApiKey: env.COPYLEAKS_API_KEY ?? "",
    publicApiUrl: (env.PUBLIC_API_URL ?? `http://localhost:${env.PORT ?? 8787}`).replace(/\/$/, ""),
  };
}
