import {
  analyse, diffRegion, mergeIssues, shiftIssues, type AnalysisResult, type DocumentType, type Issue, type Language,
  type PlanId, type StyleGuide,
} from "@gramwritingly/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { Api, ApiError, type CheckResponse } from "./api";

export interface AnalysisState {
  result: AnalysisResult;
  issues: Issue[];
  counts: CheckResponse["counts"];
  grammarStatus: CheckResponse["grammarStatus"] | "offline" | "checking";
}

/**
 * Two-speed checking:
 *  1. The core engine runs in the browser on every keystroke (style, readability, consistency).
 *  2. The server adds LanguageTool spelling and grammar plus the user's style guide after a pause.
 * Server issues are shifted as you type so underlines stay put until the next server pass.
 */
export function useAnalysis(
  text: string,
  opts: { language: Language; documentType: DocumentType; plan: PlanId; dictionary: string[]; styleGuide?: StyleGuide; dismissed: Set<string> },
): AnalysisState {
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [grammarStatus, setGrammarStatus] = useState<AnalysisState["grammarStatus"]>("checking");
  const prevText = useRef(text);
  const abort = useRef<AbortController | null>(null);

  // Keep server issues aligned with edits.
  useEffect(() => {
    const prev = prevText.current;
    if (prev === text) return;
    const d = diffRegion(prev, text);
    const delta = d.nextEnd - d.prevEnd;
    setServerIssues((list) => shiftIssues(list, d.start, d.prevEnd, delta));
    prevText.current = text;
  }, [text]);

  // Debounced server pass.
  useEffect(() => {
    const handle = setTimeout(async () => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      if (!text.trim()) {
        setServerIssues([]);
        setGrammarStatus("ok");
        return;
      }
      setGrammarStatus("checking");
      try {
        const res = await Api.check(text, opts.language, opts.documentType, ctrl.signal);
        setServerIssues(res.issues.filter((i) => i.source !== "core"));
        setGrammarStatus(res.grammarStatus);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setGrammarStatus(err instanceof ApiError && err.code === "offline" ? "offline" : "unavailable");
      }
    }, 700);
    return () => {
      clearTimeout(handle);
      // A reply for older text would land on the wrong offsets, so cancel it.
      abort.current?.abort();
    };
  }, [text, opts.language, opts.documentType]);

  // Local analysis is instant for normal documents. Very long ones are analysed after a short
  // pause and their issues shifted onto the live text in the meantime.
  const long = text.length > 20_000;
  const [analysedText, setAnalysedText] = useState(text);
  useEffect(() => {
    if (!long) return setAnalysedText(text);
    const h = setTimeout(() => setAnalysedText(text), 400);
    return () => clearTimeout(h);
  }, [text, long]);
  const source = long ? analysedText : text;

  const local = useMemo(
    () =>
      analyse(source, {
        language: opts.language, documentType: opts.documentType, plan: opts.plan, dictionary: opts.dictionary,
        styleGuide: opts.styleGuide,
      }),
    [source, opts.language, opts.documentType, opts.plan, opts.dictionary, opts.styleGuide],
  );

  const localIssues = useMemo(() => {
    if (source === text) return local.issues;
    const d = diffRegion(source, text);
    return shiftIssues(local.issues, d.start, d.prevEnd, d.nextEnd - d.prevEnd);
  }, [local.issues, source, text]);

  const issues = useMemo(() => {
    const merged = mergeIssues(serverIssues, localIssues);
    return merged.filter((i) => !opts.dismissed.has(dismissKey(text, i)));
  }, [serverIssues, localIssues, opts.dismissed, text]);

  const counts = useMemo(
    () => ({
      correctness: issues.filter((i) => ["spelling", "grammar", "punctuation"].includes(i.category)).length,
      clarity: issues.filter((i) => ["clarity", "readability"].includes(i.category)).length,
      style: issues.filter((i) => !["spelling", "grammar", "punctuation", "clarity", "readability"].includes(i.category)).length,
    }),
    [issues],
  );

  return { result: local, issues, counts, grammarStatus };
}

/** Dismissals survive edits by keying on the rule and the flagged text, not the offset. */
export function dismissKey(text: string, i: Issue) {
  return `${i.rule}|${text.slice(i.offset, i.offset + i.length).toLowerCase()}`;
}
