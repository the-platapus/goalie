/**
 * Patient tone for the monthly check-in — classified only by the state model.
 *
 * No phrase lists or regex on patient text. Emergency, hold, advance, resume,
 * skip, wrap-up, chart intent, and checklist credits are fields on ToneAssessment.
 */
import {
  extractJsonObject,
  chatCompletionLimitParams,
  createChatCompletion,
  getOpenAIModel,
  usesCompletionTokensApi,
} from "../ai/openai-client";
import { DEFAULT_ENGAGE_TONE_PROMPT } from "./default-tone-prompt";

export type PatientTone = "calm" | "engaged" | "distressed" | "frustrated";

export const CHECKLIST_TOPIC_IDS = [
  "feeling",
  "symptoms",
  "medications",
  "readings",
  "labs",
  "diet",
  "activity",
  "care_help",
  "next_checkin",
] as const;

export const CHART_TOPIC_IDS = ["medications", "readings", "diet", "activity", "labs"] as const;

export type ToneAssessment = {
  tone: PatientTone;
  /** False when they still need a reply on this topic before the script moves. */
  readyForQuestions: boolean;
  /**
   * True when the patient is describing an acute medical emergency or active
   * self-harm. Code escalates and asks the nurse model for the patient-facing
   * line (never a hardcoded string).
   */
  emergency: boolean;
  /**
   * True when they want the check-in to continue after a distress pause or a
   * tone handoff (e.g. "ok", "continue", "I'm fine now"). Code re-opens AI /
   * sends the canned resume bridge — it does not regex the text.
   */
  resumeCheckIn: boolean;
  /**
   * True when they decline THIS question only (skip / idk / rather not). Code
   * advances past the beat — not wrap-up of the month, not opt-out.
   */
  skipQuestion: boolean;
  /**
   * True when they are done with THIS month's questions (that's enough / I'm
   * done / nothing else). Code closes the cycle with the fixed complete line —
   * not opt-out of the programme, not skip of one beat.
   */
  wrapUpCheckIn: boolean;
  /** Low mood that should stay on the beat (not crisis, not skip). */
  lowMood: boolean;
  /** Whole message is asking how the nurse is. */
  askedHowAreYou: boolean;
  /** Bare "what / huh / come again" — clarify, do not advance. */
  unclear: boolean;
  /** Asked what is on file / the chart / their record. */
  askedAboutChart: boolean;
  /** Named a chart slice: medications | readings | diet | activity | labs. */
  namedChartTopic: string | null;
  /** Asked to flag / contact / get help from the care manager. */
  wantsCareManagerHelp: boolean;
  /** Checklist topic ids this message clearly answers (may include unasked ones). */
  creditedTopics: string[];
  /** Primary checklist topic they are speaking about. */
  spokenTopicId: string | null;
  /** Enough content to compare to the chart for the current/named topic. */
  compareChart: boolean;
  /** Asked for the chart slice of the current/named topic. */
  askedForChartSlice: boolean;
  /** Short yes without naming medicines. */
  bareYes: boolean;
  /** Taking everything as prescribed. */
  takingAsPrescribed: boolean;
  /** Drug-like name they volunteered, or null. */
  extraMedicationName: string | null;
  /** Home BP-like reading or reading with a unit. */
  hasHomeReading: boolean;
};

/**
 * Grief / fear that is not settling. Auto-handoff only after this many
 * listening AI replies.
 */
export const TONE_DISTRESSED_HANDOFF_REPLIES = 6;

export const TONE_COOLDOWN_ESCALATION_REASON =
  "Patient remained distressed after support attempts — human handoff";

const TONES = new Set<PatientTone>(["calm", "engaged", "distressed", "frustrated"]);
const CHECKLIST_SET = new Set<string>(CHECKLIST_TOPIC_IDS);
const CHART_SET = new Set<string>(CHART_TOPIC_IDS);

export function emptyToneHold(): ToneAssessment {
  return {
    tone: "engaged",
    readyForQuestions: false,
    emergency: false,
    resumeCheckIn: false,
    skipQuestion: false,
    wrapUpCheckIn: false,
    lowMood: false,
    askedHowAreYou: false,
    unclear: false,
    askedAboutChart: false,
    namedChartTopic: null,
    wantsCareManagerHelp: false,
    creditedTopics: [],
    spokenTopicId: null,
    compareChart: false,
    askedForChartSlice: false,
    bareYes: false,
    takingAsPrescribed: false,
    extraMedicationName: null,
    hasHomeReading: false,
  };
}

/** Pause the script and listen — grief/fear/overwhelm only. */
export function shouldPauseForDistress(assessment: ToneAssessment): boolean {
  return assessment.tone === "distressed";
}

/**
 * Do not advance the checklist. Questions, vents, and distress all hold.
 * Frustrated does not escalate to a human on its own — it stays on this beat
 * so the nurse can acknowledge it.
 */
export function shouldHoldScript(assessment: ToneAssessment): boolean {
  return (
    !assessment.readyForQuestions ||
    assessment.tone === "distressed" ||
    assessment.tone === "frustrated" ||
    assessment.lowMood ||
    assessment.askedHowAreYou ||
    assessment.unclear ||
    assessment.askedAboutChart
  );
}

export function isSettledTone(assessment: ToneAssessment): boolean {
  return (
    assessment.readyForQuestions &&
    (assessment.tone === "calm" || assessment.tone === "engaged")
  );
}

/**
 * Auto-handoff is grief/fear that did not settle — not irritation.
 */
export function shouldToneHandoff(
  assessment: ToneAssessment,
  distressedReplies: number
): boolean {
  if (!shouldPauseForDistress(assessment)) return false;
  return distressedReplies >= TONE_DISTRESSED_HANDOFF_REPLIES;
}

export function parseToneAssessment(raw: string): ToneAssessment {
  const hold = emptyToneHold();
  const extracted = extractJsonObject(String(raw ?? ""));
  if (!extracted.ok) return hold;

  const v = extracted.value;
  const tone = String(v.tone || "").toLowerCase() as PatientTone;
  if (!TONES.has(tone)) return hold;

  const creditedTopics = Array.isArray(v.creditedTopics)
    ? v.creditedTopics.map(String).filter((id: string) => CHECKLIST_SET.has(id))
    : [];

  return {
    tone,
    readyForQuestions: v.readyForQuestions ?? true,
    emergency: !!v.emergency,
    resumeCheckIn: !!v.resumeCheckIn,
    skipQuestion: !!v.skipQuestion,
    wrapUpCheckIn: !!v.wrapUpCheckIn,
    lowMood: !!v.lowMood,
    askedHowAreYou: !!v.askedHowAreYou,
    unclear: !!v.unclear,
    askedAboutChart: !!v.askedAboutChart,
    namedChartTopic: CHART_SET.has(String(v.namedChartTopic)) ? String(v.namedChartTopic) : null,
    wantsCareManagerHelp: !!v.wantsCareManagerHelp,
    creditedTopics: [...new Set(creditedTopics)],
    spokenTopicId: CHECKLIST_SET.has(String(v.spokenTopicId)) ? String(v.spokenTopicId) : null,
    compareChart: !!v.compareChart,
    askedForChartSlice: !!v.askedForChartSlice,
    bareYes: !!v.bareYes,
    takingAsPrescribed: !!v.takingAsPrescribed,
    extraMedicationName: v.extraMedicationName && typeof v.extraMedicationName === "string" && v.extraMedicationName.trim().length >= 3 ? v.extraMedicationName.trim() : null,
    hasHomeReading: !!v.hasHomeReading,
  } as ToneAssessment;
}

/**
 * Classify the latest patient message. One cheap JSON call — not the nurse
 * reply. All state routing fields come from here.
 */
export async function assessPatientTone(
  userMessage: string,
  opts: {
    priorTone?: string;
    cooldownActive?: boolean;
    currentTopicId?: string;
    lastAssistantText?: string;
  } = {}
): Promise<ToneAssessment> {
  const prior = String(opts.priorTone || "").trim() || "unknown";
  const cooling = opts.cooldownActive ? "yes" : "no";
  const topic = String(opts.currentTopicId || "").trim() || "unknown";
  const lastNurse = String(opts.lastAssistantText || "").trim().slice(0, 500) || "(none)";
  const system = DEFAULT_ENGAGE_TONE_PROMPT;

  try {
    const model = getOpenAIModel();
    const res = await createChatCompletion({
      model,
      ...chatCompletionLimitParams(model, usesCompletionTokensApi(model) ? 400 : 160, 0, "low"),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system.replace("{topic}", topic).replace("{lastNurse}", lastNurse).replace("{prior}", prior).replace("{cooling}", cooling) },
        { role: "user", content: String(userMessage ?? "").slice(0, 2000) },
      ],
    });
    return parseToneAssessment(res.choices?.[0]?.message?.content ?? "");
  } catch (err) {
    console.warn("[engage] tone classify failed:", (err as Error)?.message || err);
    return emptyToneHold();
  }
}
