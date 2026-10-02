import {
  chatCompletionLimitParams,
  createChatCompletion,
  getEngagePatientOpenAIModel,
  getOpenAIModel,
  usesCompletionTokensApi,
} from "./openai-client";
import type { EngageChatTurn } from "../response-level/prompt-builder";

export type ChatReasoningEffort = "low" | "medium" | "high";

/** LLM function shape — injectable so the reply loop is testable without OpenAI. */
export type EngageLlm = (
  systemPrompt: string,
  userMessage: string,
  maxChars: number,
  /** Prior turns this cycle (oldest → newest), excluding `userMessage`. */
  priorTurns?: EngageChatTurn[]
) => Promise<string>;

const OPENER =
  "(Start this month's check-in: greet the patient, introduce yourself as their care assistant nurse, name their Care Manager, provider, and practice when those names appear in the profile, say you are starting the monthly check-in. Do not ask how they are feeling yet — identity is collected separately.)";

async function completeReply(
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxChars: number,
  priorTurns: EngageChatTurn[] = [],
  reasoningEffort?: ChatReasoningEffort
): Promise<{ text: string }> {
  // GPT-5 / o-series count reasoning toward the completion budget, so a
  // SMS-sized max_tokens can return an empty message. Give those models room.
  const smsBudget = Math.ceil(maxChars / 3) + 40;
  const tokenBudget = usesCompletionTokensApi(model) ? Math.max(smsBudget, 1200) : smsBudget;
  const history = priorTurns
    .filter((t) => t.content.trim())
    .map((t) => ({ role: t.role, content: t.content }));
  const res = await createChatCompletion({
    model,
    ...chatCompletionLimitParams(model, tokenBudget, 0.4, reasoningEffort),
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userMessage && userMessage.trim() ? userMessage : OPENER },
    ],
  });
  const reply = (res.choices?.[0]?.message?.content ?? "").trim();
  // Hard cap disabled — it sliced mid-word and sent the patient a half-sentence.
  // if (reply.length > maxChars) reply = reply.slice(0, maxChars - 1).trimEnd() + "…";
  return { text: reply };
}

/**
 * Shared OpenAI chat helper on OPENAI_MODEL. Used by AI Enrollment, campaign
 * mail, and lead outreach — not the monthly patient check-in.
 */
export const generateAiReply: EngageLlm = async (systemPrompt, userMessage, maxChars, priorTurns) => {
  const res = await completeReply(getOpenAIModel(), systemPrompt, userMessage, maxChars, priorTurns, "low");
  return res.text;
};

/**
 * Monthly CCM/RPM check-in replies (DEFAULT_ENGAGE_SYSTEM_PROMPT and the
 * tenant override of it). Uses HC_OPENAI_MODEL.
 */
export const generateEngagePatientReply: EngageLlm = async (systemPrompt, userMessage, maxChars, priorTurns) => {
  const model = getEngagePatientOpenAIModel();
  const res = await completeReply(
    model,
    systemPrompt,
    userMessage,
    Math.max(Number(maxChars) || 0, 1200),
    priorTurns,
    "low"
  );
  return res.text;
};

/** Drop the just-persisted inbound so it is only the final user message once. */
export function priorTurnsExcludingCurrent(
  turns: EngageChatTurn[] | undefined,
  userMessage: string
): EngageChatTurn[] {
  const list = [...(turns ?? [])];
  const current = String(userMessage ?? "").trim();
  if (current && list.length && list[list.length - 1].role === "user" && list[list.length - 1].content === current) {
    list.pop();
  }
  return list;
}
