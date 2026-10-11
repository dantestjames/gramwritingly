import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "../config.js";

export type ModelTier = "fast" | "deep";

export interface CompletionRequest {
  tier: ModelTier;
  system: string;
  prompt: string;
  maxTokens?: number;
}

export interface AiService {
  configured: boolean;
  complete(req: CompletionRequest): Promise<string>;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI features are not configured on this server. Set ANTHROPIC_API_KEY.");
  }
}

export function createClaude(config: Config): AiService {
  if (!config.anthropicApiKey) {
    return {
      configured: false,
      async complete() {
        throw new AiNotConfiguredError();
      },
    };
  }
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  return {
    configured: true,
    async complete({ tier, system, prompt, maxTokens = 1500 }) {
      const msg = await client.messages.create({
        model: tier === "deep" ? config.claudeDeepModel : config.claudeFastModel,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      });
      return msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    },
  };
}

/** Pulls the first JSON object or array out of a model reply. */
export function parseJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1]! : raw;
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error("No JSON in model reply");
  const open = body[start]!;
  const close = open === "{" ? "}" : "]";
  const end = body.lastIndexOf(close);
  return JSON.parse(body.slice(start, end + 1)) as T;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const BASE_RULES = (language: string) =>
  `You are the writing assistant inside Gramwritingly. Write in ${language} spelling and usage. ` +
  `Keep the author's meaning, facts, names and numbers exactly. Never invent facts. ` +
  `Do not use em-dashes. Return only the JSON requested, no commentary.`;

export const REWRITE_MODES = {
  fix: "Fix wordiness, weak phrases and passive voice. Keep it close to the original.",
  shorten: "Make it noticeably shorter. Cut filler, keep every key point.",
  detail: "Add useful, concrete detail that fits the context. Do not invent facts, names or numbers.",
  confident: "Make it sound more confident and decisive. Remove hedges and apologies.",
  friendly: "Make it warmer and more friendly while staying professional.",
  casual: "Make it more casual and conversational.",
  formal: "Make it more formal and polished.",
  persuasive: "Make it more persuasive. Lead with the benefit to the reader.",
  fluency: "Rewrite so it reads like a fluent native speaker wrote it. Fix unnatural phrasing and word choice.",
  simplify: "Rewrite in plain English for a Year 8 reading level.",
  custom: "",
} as const;
export type RewriteMode = keyof typeof REWRITE_MODES;

export function rewritePrompt(mode: RewriteMode, text: string, language: string, instruction?: string, voiceSample?: string) {
  const task = mode === "custom" ? (instruction ?? "Improve this text.") : REWRITE_MODES[mode];
  return {
    system: BASE_RULES(language),
    prompt:
      `Task: ${task}\n` +
      (voiceSample ? `Match the author's voice. Sample of their writing:\n<voice>\n${voiceSample.slice(0, 2000)}\n</voice>\n` : "") +
      `Text to rewrite:\n<text>\n${text}\n</text>\n\n` +
      `Return JSON: {"variants": ["best rewrite", "second option", "third option"], "explanation": "one short sentence on what changed"}`,
  };
}

export function feedbackPrompt(text: string, documentType: string, language: string) {
  return {
    system: BASE_RULES(language) + " You are a sharp, honest editor. Be specific and quote the text you refer to.",
    prompt:
      `Review this ${documentType} document. Give prioritised, actionable feedback.\n<document>\n${text}\n</document>\n\n` +
      `Return JSON: {"overall": "two or three sentences", "strengths": ["..."], ` +
      `"priorities": [{"title": "...", "detail": "...", "quote": "short quote from the text or empty"}], ` +
      `"tone": "how it currently reads", "consistency": ["any inconsistencies in terms, tense, voice or formatting"]}`,
  };
}

export function critiquePrompt(text: string, genre: string, language: string) {
  return {
    system: BASE_RULES(language) + " You are an experienced developmental editor of fiction and narrative non-fiction.",
    prompt:
      `Critique this chapter or short story${genre ? ` (genre: ${genre})` : ""}. Cover hook, character, plot and tension, ` +
      `pacing, dialogue, point of view, setting and the ending. Be candid and specific.\n<chapter>\n${text}\n</chapter>\n\n` +
      `Return JSON: {"summary": "...", "scores": {"hook": 1-10, "character": 1-10, "plot": 1-10, "pacing": 1-10, ` +
      `"dialogue": 1-10, "prose": 1-10}, "whatWorks": ["..."], "toImprove": [{"area": "...", "note": "...", "quote": "..."}], ` +
      `"readerExperience": "how a reader is likely to feel, where they may drift"}`,
  };
}

export const SPARK_KINDS = {
  continue: "Suggest three different ways the text could continue (one or two sentences each).",
  describe: "Suggest three vivid, concrete descriptions that could be added, using the senses.",
  dialogue: "Suggest three short lines of dialogue that would fit naturally next.",
  brainstorm: "Brainstorm five ideas, angles or next points the author could cover.",
  headline: "Suggest five headlines or titles for this text.",
  example: "Suggest three concrete examples or analogies that would support the main point.",
} as const;
export type SparkKind = keyof typeof SPARK_KINDS;

export function sparkPrompt(kind: SparkKind, text: string, language: string) {
  return {
    system: BASE_RULES(language) + " You help writers past a blank page with fresh, specific suggestions.",
    prompt: `${SPARK_KINDS[kind]}\n<text>\n${text.slice(-4000)}\n</text>\n\nReturn JSON: {"ideas": ["..."]}`,
  };
}

export function synonymsPrompt(word: string, context: string, language: string) {
  return {
    system: BASE_RULES(language),
    prompt:
      `Give up to 8 context-appropriate replacements for "${word}" in this sentence, best first. ` +
      `Each must fit grammatically without other changes.\n<sentence>\n${context}\n</sentence>\n\nReturn JSON: {"synonyms": ["..."]}`,
  };
}

export function detectPrompt(text: string) {
  return {
    system:
      "You estimate whether text was written by an AI language model. Detection is unreliable, so be calibrated " +
      "and never claim certainty. Return only JSON.",
    prompt:
      `Assess this text.\n<text>\n${text}\n</text>\n\nReturn JSON: {"likelihood": 0-100, ` +
      `"signals": [{"quote": "short quote", "why": "..."}], "humanSignals": ["..."], ` +
      `"suggestions": ["specific edits that would make it read more like the author's own voice"]}`,
  };
}
