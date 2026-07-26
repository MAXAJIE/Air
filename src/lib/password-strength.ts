import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as zxcvbnCommon from "@zxcvbn-ts/language-common";
import * as zxcvbnEn from "@zxcvbn-ts/language-en";

let factory: ZxcvbnFactory | null = null;

function getFactory() {
  if (!factory) {
    factory = new ZxcvbnFactory({
      dictionary: { ...zxcvbnCommon.dictionary, ...zxcvbnEn.dictionary },
      graphs: zxcvbnCommon.adjacencyGraphs,
      translations: zxcvbnEn.translations,
    });
  }
  return factory;
}

export type StrengthReport = {
  score: 0 | 1 | 2 | 3 | 4;
  warning: string;
  suggestions: string[];
  crackTime: string;
};

/** zxcvbn-based entropy scoring — same model as the reference implementation. */
export function scorePassword(password: string, userInputs: string[] = []): StrengthReport {
  if (!password) return { score: 0, warning: "", suggestions: [], crackTime: "" };
  const result = getFactory().check(password, userInputs.filter(Boolean));
  return {
    score: result.score as StrengthReport["score"],
    warning: result.feedback.warning ?? "",
    suggestions: result.feedback.suggestions ?? [],
    crackTime: String(result.crackTimes.offlineSlowHashingXPerSecond.display),
  };
}
