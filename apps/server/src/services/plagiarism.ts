import type { Config } from "../config.js";

export interface PlagiarismMatch {
  url: string;
  title: string;
  matchedWords: number;
  identicalWords: number;
  introduction?: string;
}

export interface PlagiarismResult {
  /** Percentage of the text found elsewhere. */
  score: number;
  totalWords: number;
  matches: PlagiarismMatch[];
}

export interface PlagiarismProvider {
  name: string;
  configured: boolean;
  /**
   * Starts a scan. Results arrive later through the webhook.
   * `callbackUrl` must contain the literal {STATUS} placeholder.
   */
  submit(scanId: string, text: string, callbackUrl: string): Promise<void>;
  /** Turns a provider webhook body into our result shape. */
  parseCompleted(body: unknown): PlagiarismResult;
}

export class CopyleaksProvider implements PlagiarismProvider {
  name = "copyleaks";
  configured: boolean;
  private token: { value: string; expires: number } | null = null;

  constructor(private config: Config, private fetchImpl: typeof fetch = fetch) {
    this.configured = Boolean(config.copyleaksEmail && config.copyleaksApiKey);
  }

  private async login(): Promise<string> {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const res = await this.fetchImpl("https://id.copyleaks.com/v3/account/login/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.config.copyleaksEmail, key: this.config.copyleaksApiKey }),
    });
    if (!res.ok) throw new Error(`Copyleaks login failed (${res.status})`);
    const data = (await res.json()) as { access_token: string; ".expires"?: string };
    const expires = data[".expires"] ? Date.parse(data[".expires"]) : Date.now() + 47 * 3600_000;
    this.token = { value: data.access_token, expires };
    return data.access_token;
  }

  async submit(scanId: string, text: string, callbackUrl: string) {
    const token = await this.login();
    const res = await this.fetchImpl(`https://api.copyleaks.com/v3/scans/submit/file/${scanId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        base64: Buffer.from(text, "utf8").toString("base64"),
        filename: `${scanId}.txt`,
        properties: {
          webhooks: { status: callbackUrl },
          sandbox: process.env.NODE_ENV !== "production",
          expiration: 24,
        },
      }),
    });
    if (!res.ok) throw new Error(`Copyleaks submit failed (${res.status})`);
  }

  parseCompleted(body: unknown): PlagiarismResult {
    const b = body as {
      scannedDocument?: { totalWords?: number };
      results?: {
        score?: { aggregatedScore?: number };
        internet?: { url: string; title: string; matchedWords: number; identicalWords: number; introduction?: string }[];
      };
    };
    return {
      score: b.results?.score?.aggregatedScore ?? 0,
      totalWords: b.scannedDocument?.totalWords ?? 0,
      matches: (b.results?.internet ?? [])
        .map((m) => ({ url: m.url, title: m.title, matchedWords: m.matchedWords, identicalWords: m.identicalWords, introduction: m.introduction }))
        .sort((a, z) => z.matchedWords - a.matchedWords)
        .slice(0, 25),
    };
  }
}

export function createPlagiarism(config: Config): PlagiarismProvider {
  if (config.plagiarismProvider === "copyleaks") return new CopyleaksProvider(config);
  return {
    name: "none",
    configured: false,
    async submit() {
      throw new Error("Plagiarism checking is not configured on this server.");
    },
    parseCompleted: () => ({ score: 0, totalWords: 0, matches: [] }),
  };
}
