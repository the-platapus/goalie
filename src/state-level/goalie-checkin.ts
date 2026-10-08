import type { ClassifierResult } from "./goalie-classifier";
/**
 * The monthly check-in as a list of questions, not a conversation the model
 * is trusted to finish.
 *
 * Left to the prompt, the assistant asks forever: "that's enough" and "I'm
 * done" were only hints, skip was never a real action, and nothing in code
 * knew when the script had been covered. The goal is answers, then an ending.
 * So the topics live here, skips are counted here, and the close is a fixed
 * line the model does not get to rewrite.
 */
export interface CheckInTopic {
  id: string;
  /** What the model is told to ask about this turn. */
  label: string;
  /** Sent if the model returns nothing. */
  fallback: string;
  /** Extra client-script guidance for this beat. */
  script?: string;
}

export const CHECK_IN_TOPICS: CheckInTopic[] = [
  {
    id: "feeling",
    label: "how they are doing overall this month",
    fallback: "How have you been doing this month?",
    script:
      "Ask how they have been doing this month. If they name one issue, one follow-up on that issue.",
  },
  {
    id: "symptoms",
    label: "any active symptoms or problems they want to share",
    fallback: "Are there any symptoms or problems you want to share with me today?",
    script:
      "Ask whether anything has been bothering them. Do not add a laundry list they did not mention (pain, redness, warmth, fever). If they name one problem, at most two follow-up questions about it, one per turn, then stop.",
  },
  {
    id: "medications",
    label: "whether they are taking their prescribed medications",
    fallback: "Are you taking your prescribed medicines?",
    script:
      "Ask if they are taking their prescribed medicines. A yes or no is enough. If they say no, ask why. Do not name or list medicines. Do not quiz doses. Never say the list is missing.",
  },
  {
    id: "readings",
    label: "home readings they can share (not a device recap)",
    fallback: "Have you been able to check your blood pressure at home lately?",
    script:
      "If they are on RPM, do not ask them to recap device readings. If they are not on RPM, ask whether they have been able to check readings at home. Never mention device counts.",
  },
  {
    id: "labs",
    label: "labs the doctor ordered, whether they are done, and compare to results on file if recorded",
    fallback: "Has the doctor ordered any labs for you — and if so, have you been able to get them done?",
    script:
      "Ask whether labs were ordered and whether they have gotten them done. If labs are recorded in the file, compare to the file when they answer or ask. Do not invent labs.",
  },
  {
    id: "diet",
    label: "how eating has been (compare to the diet plan in our care plan if recorded)",
    fallback: "How has your eating been this month?",
    script:
      "Ask how eating has been. If a diet plan is recorded in the file, compare to the file when they answer or ask.",
  },
  {
    id: "activity",
    label: "how activity has been (compare to the activity plan in our care plan if recorded)",
    fallback: "How has moving around been this month?",
    script:
      "Ask how activity has been. If an activity plan is recorded in the file, compare to the file when they answer or ask.",
  },
  {
    id: "care_help",
    label: "any other help they need coordinating their care",
    fallback: "Is there any other help with your care that I can coordinate for you?",
    script:
      "Ask if they need any other help coordinating their care. If they say yes, get the details.",
  },
  {
    id: "next_checkin",
    label: "thank them and confirm the next monthly check-in date and time",
    fallback: "That's all the check-in questions I have. Are you available for next month's check-in at the time I have on file?",
    script:
      "Acknowledge that is all the questions. Ask whether the next monthly check-in time on file works. If they decline or tell you that the time doesn't work, ask what time works better for them. Do not recap clinical facts.",
  },
];

/** Skips allowed in one cycle before the check-in is closed with what we have. */
export const CHECK_IN_SKIP_LIMIT = 3;

export function topicAt(step: number): CheckInTopic | null {
  if (step < 0 || step >= CHECK_IN_TOPICS.length) return null;
  return CHECK_IN_TOPICS[step];
}

export function checkInStepOf(convo: { checkInStep?: number } | null | undefined): number {
  const n = Number(convo?.checkInStep ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), CHECK_IN_TOPICS.length);
}

export function checkInSkipCountOf(convo: { checkInSkipCount?: number } | null | undefined): number {
  const n = Number(convo?.checkInSkipCount ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export const CHECK_IN_COMPLETE_REPLY =
  "That's everything for this month's check-in. We'll be in touch next month. " +
  "If something changes before then, reach out to your Care Manager.";

/** mm/dd, hh:mm AM/PM CST — client format for the next monthly check-in. */
export function formatNextCheckInCst(at: Date | string | null | undefined): string {
  if (!at) return "";
  const d = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const month = g("month");
  const day = g("day");
  const hour = g("hour");
  const minute = g("minute");
  const dayPeriod = g("dayPeriod").toUpperCase();
  if (!month || !day) return "";
  return `${month}/${day}, ${hour}:${minute} ${dayPeriod} CST`;
}

export function checkInCompleteReply(nextAt?: Date | string | null): string {
  return (
    `That's everything for this month's check-in. ` +
    `If something changes before we speak next, reach out to your Care Manager.`
  );
}

export const CHECK_IN_ENDED_SKIP_REPLY =
  "Understood — we'll leave the rest for next time. This month's check-in is done. " +
  "We'll be in touch next month. If something changes before then, reach out to your Care Manager.";

export const CHECK_IN_ALREADY_CLOSED_REPLY =
  "This month's check-in is already complete. We'll reach out next month. " +
  "If something urgent comes up, contact your Care Manager.";

/**
 * Hold-turn fail-open when we cannot ground from the chart. Never the
 * questionnaire fallback — that is what made "do I have panadol on the list?"
 * look like the nurse did not hear them.
 */
export const CHECK_IN_HOLD_SAFE_FALLBACK =
  "I want to be sure I heard you right — could you say that another way?";

/**
 * Frustrated-turn fail-open. Never the questionnaire line — repeating the
 * question they just called stupid is how the nurse looked like she was
 * ignoring them.
 */
export const CHECK_IN_VENT_SAFE_FALLBACK =
  "I hear you. I'm not trying to talk over you. We can slow this down — tell me what you need from me right now.";

/** Low mood — listen and offer a person. Never a diet/labs dump. */
export const CHECK_IN_MOOD_SAFE_FALLBACK =
  "I'm glad you told me. I'm here with you. Would you like me to connect you with someone from your care team, or would you rather tell me a little more first?";

/** Patient check-in replies are not SMS-segment-capped. 160 made the model recite canned one-liners. */
export const CHECK_IN_REPLY_CHARS = 1200;

const CHART_GROUND_TOPICS = new Set(["medications", "readings", "diet", "activity", "labs"]);

export type ChartFailOpenValues = {
  PATIENT_MEDICATIONS?: string;
  PATIENT_READINGS_NORMAL_COUNT?: string;
  PATIENT_READINGS_ABNORMAL?: string;
  PATIENT_DIET?: string;
  PATIENT_ACTIVITY?: string;
  PATIENT_LABS?: string;
  PATIENT_CARE_MANAGER?: string;
};

export type ChartGroundOpts = {
  userMessage?: string;
  lastAssistantText?: string;
  priorAssistantTexts?: string[];
  isRpm?: boolean;
  tone?: ClassifierResult;
};

function isRecordedChartField(raw: string | undefined): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return false;
  return s !== "not recorded" && s !== "none";
}

function flattenChartLines(raw: string): string {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => {
      const lower = s.toLowerCase();
      return Boolean(s) && lower !== "not recorded" && lower !== "none";
    })
    .join("; ");
}

function careManagerSpeak(_values: ChartFailOpenValues): string {
  return "your care manager";
}

function priorAssistantLines(opts: {
  lastAssistantText?: string;
  priorAssistantTexts?: string[];
  lastAssistant?: string;
}): string[] {
  const extra = opts.priorAssistantTexts ?? [];
  const last = String(opts.lastAssistantText ?? opts.lastAssistant ?? "").trim();
  return last ? [...extra, last] : extra;
}

function alreadyOfferedFlagCareManager(texts: string[]): boolean {
  return texts.some((t) => {
    const s = String(t ?? "").toLowerCase();
    return s.includes("flag") && s.includes("care manager");
  });
}

function flagCareManagerHelpClause(cm: string, thatOrIt: "that" | "it", opts: ChartGroundOpts): string {
  const already = alreadyOfferedFlagCareManager(priorAssistantLines(opts));
  if (already && !opts.tone?.wantsCareManagerHelp) return "";
  return ` I can flag ${cm} if you want help with ${thatOrIt}.`;
}

function chartMedicationNames(values: ChartFailOpenValues): string[] {
  const raw = String(values.PATIENT_MEDICATIONS ?? "");
  if (!isRecordedChartField(raw)) return [];
  const names: string[] = [];
  for (const line of raw.split("\n").flatMap((l) => l.split(";"))) {
    let cut = line.split("—")[0].split("–")[0];
    const dash = cut.indexOf("-");
    if (dash > 0) cut = cut.slice(0, dash);
    cut = cut.trim();
    let name = cut;
    for (let i = 0; i < cut.length - 1; i++) {
      if (cut[i] === " " && cut[i + 1] >= "0" && cut[i + 1] <= "9") {
        name = cut.slice(0, i).trim();
        break;
      }
    }
    const lower = name.toLowerCase();
    if (name.length > 2 && lower !== "not recorded" && lower !== "problems") names.push(name);
  }
  return names;
}

function userNamedChartMeds(text: string, names: string[]): string[] {
  const t = String(text ?? "").toLowerCase();
  return names.filter((n) => n && t.includes(n.toLowerCase()));
}

export function patientIsRpm(programs: unknown, carePlanType?: unknown): boolean {
  const list = Array.isArray(programs) ? programs : [];
  const set = new Set(
    [...list, carePlanType]
      .map((p) => String(p ?? "").trim().toLowerCase())
      .filter(Boolean)
  );
  return set.has("rpm");
}

/** Jump past the readings beat when the patient is on RPM. */
export function skipRpmReadingsStep(step: number, isRpm: boolean): number {
  if (!isRpm) return Math.max(0, step);
  let next = Math.max(0, step);
  while (topicAt(next)?.id === "readings") next += 1;
  return next;
}

const CHECK_IN_TOPIC_IDS = CHECK_IN_TOPICS.map((t) => t.id);

function asCoveredIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const allow = new Set(CHECK_IN_TOPIC_IDS);
  return ids.map((id) => String(id ?? "").trim()).filter((id) => allow.has(id));
}

/**
 * Topics already answered or skipped this cycle.
 * Older threads only stored checkInStep — treat 0…step-1 as covered.
 */
export function checkInCoveredOf(
  convo: { checkInCovered?: string[]; checkInStep?: number } | null | undefined,
  isRpm = false
): string[] {
  const stored = asCoveredIds(convo?.checkInCovered);
  if (stored.length) return mergeCheckInCovered(stored, [], isRpm);
  const step = checkInStepOf(convo);
  const fromStep = CHECK_IN_TOPICS.slice(0, step).map((t) => t.id);
  return mergeCheckInCovered(fromStep, [], isRpm);
}

export function topicById(id: string | null | undefined): CheckInTopic | null {
  const key = String(id ?? "").trim();
  if (!key) return null;
  return CHECK_IN_TOPICS.find((t) => t.id === key) ?? null;
}

export function mergeCheckInCovered(existing: string[], extra: string[], isRpm = false): string[] {
  const set = new Set([...asCoveredIds(existing), ...asCoveredIds(extra)]);
  if (isRpm) set.add("readings");
  return CHECK_IN_TOPIC_IDS.filter((id) => set.has(id));
}

/** Index of the first topic not yet covered (CHECK_IN_TOPICS.length if none left). */
export function firstUnansweredIndex(covered: string[], isRpm = false, hasMeds = true): number {
  const set = new Set(asCoveredIds(covered));
  if (isRpm) set.add("readings");
  if (!hasMeds) set.add("medications");
  const i = CHECK_IN_TOPICS.findIndex((t) => !set.has(t.id));
  return i < 0 ? CHECK_IN_TOPICS.length : i;
}

export function firstUnansweredTopic(covered: string[], isRpm = false, hasMeds = true): CheckInTopic | null {
  return topicAt(firstUnansweredIndex(covered, isRpm, hasMeds));
}

export function isChartGroundTopic(topicId: string): boolean {
  return CHART_GROUND_TOPICS.has(topicId);
}

/** Checklist items this line clearly answers — from the state classifier. */
export function checklistCredits(tone: ClassifierResult | null | undefined): string[] {
  return asCoveredIds(tone?.creditedTopics ?? []);
}

/** Which checklist item they are talking about — from the state classifier. */
export function spokenChecklistTopic(
  tone: ClassifierResult | null | undefined,
  currentTopicId?: string
): string | undefined {
  const spoken = String(tone?.spokenTopicId ?? "").trim();
  if (spoken && CHECK_IN_TOPIC_IDS.includes(spoken)) return spoken;
  return currentTopicId;
}

function medicationsCompareReply(
  userMessage: string,
  values: ChartFailOpenValues,
  tone?: ClassifierResult
): string {
  const names = chartMedicationNames(values);
  const mentioned = userNamedChartMeds(userMessage, names);
  const extra = String(tone?.extraMedicationName ?? "").trim();
  if (extra && !mentioned.some((n) => n.toLowerCase() === extra.toLowerCase())) {
    return `I've added ${extra} to my notes.`;
  }
  if (tone?.askedForChartSlice || tone?.namedChartTopic === "medications") {
    if (!names.length) {
      return "That list isn't here. What medications are you taking these days?";
    }
    return `On the care plan I have: ${flattenChartLines(String(values.PATIENT_MEDICATIONS))}. Does that match what you're taking?`;
  }
  if (tone?.medicationAnswer === 'as_prescribed' || tone?.medicationAnswer === 'bare_yes') {
    return "That's good to hear you are taking your medicines.";
  }
  if (!names.length) {
    return "What medications are you taking these days?";
  }
  const missed = names.filter((n) => !mentioned.some((m) => m.toLowerCase() === n.toLowerCase()));
  if (mentioned.length && missed.length) {
    return `Got it. I also have ${missed.join(", ")} on the plan.`;
  }
  if (mentioned.length) {
    return "That's great — staying with the medicines on your plan is a good job.";
  }
  return "Are you taking your prescribed medicines?";
}

function readingsAskOrCompare(
  userMessage: string,
  values: ChartFailOpenValues,
  isRpm: boolean,
  tone?: ClassifierResult
): string {
  if (isRpm) {
    if (tone?.readings && tone.readings.length > 0) {
      return "I'll keep that number in mind. We don't need to recap the device readings — those already come through to the office.";
    }
    return "We don't need to recap device readings — those already come through to the office.";
  }
  if (tone?.readings && tone.readings.length > 0) {
    const abn = isRecordedChartField(values.PATIENT_READINGS_ABNORMAL)
      ? flattenChartLines(String(values.PATIENT_READINGS_ABNORMAL))
      : "";
    if (abn) {
      return `Got it — I have ${userMessage.trim()} from you. Recently recorded: ${abn}. Does that feel right?`;
    }
    return `Got it, I'll record that reading.`;
  }
  return "Have you been able to check your blood pressure at home lately?";
}

/** Deterministic backup from values already in the nurse prompt. Ask first; compare only after they named something or asked. */
export function chartGroundedReply(
  topicId: string,
  values: ChartFailOpenValues = {},
  opts: ChartGroundOpts = {}
): string | null {
  const user = String(opts.userMessage ?? "");
  const tone = opts.tone;
  const compare = Boolean(tone?.compareChart || tone?.askedForChartSlice);
  const slice = Boolean(tone?.askedForChartSlice || tone?.namedChartTopic === topicId);
  const askedChart = Boolean(tone?.askedAboutChart || slice);
  switch (topicId) {
    case "medications":
      // Bare yes / taking-as-prescribed fully satisfies the beat — KB forbids
      // asking them to name or list medicines. Compare only when they volunteered
      // names, asked for the chart slice, or otherwise gave compare content.
      if (tone?.medicationAnswer === 'bare_yes' || tone?.medicationAnswer === 'as_prescribed') {
        return "That's good to hear you are taking your medicines.";
      }
      return compare || slice
        ? medicationsCompareReply(user, values, tone)
        : "Are you taking your prescribed medicines?";
    case "readings":
      return readingsAskOrCompare(user, values, Boolean(opts.isRpm), tone);
    case "diet": {
      const diet = String(values.PATIENT_DIET ?? "").trim();
      const cm = careManagerSpeak(values);
      if (!compare && !slice) {
        return "How has your eating been this month?";
      }
      if (isRecordedChartField(diet)) {
        return `Your doctor noted: ${diet}.${flagCareManagerHelpClause(cm, "that", opts)}`;
      }
      if (askedChart) {
        return `That isn't listed.${flagCareManagerHelpClause(cm, "it", opts)}`;
      }
      return "I'm glad to hear that.";
    }
    case "activity": {
      const activity = String(values.PATIENT_ACTIVITY ?? "").trim();
      const cm = careManagerSpeak(values);
      if (!compare && !slice) {
        return "How has moving around been this month?";
      }
      if (isRecordedChartField(activity)) {
        return `Your doctor noted: ${activity}.${flagCareManagerHelpClause(cm, "that", opts)}`;
      }
      if (askedChart) {
        return `That isn't listed.${flagCareManagerHelpClause(cm, "it", opts)}`;
      }
      return "I'm glad to hear that.";
    }
    case "labs": {
      if (!compare && !slice) {
        return "Has the doctor ordered any labs for you — and if so, have you been able to get them done?";
      }
      const labs = String(values.PATIENT_LABS ?? "").trim();
      if (isRecordedChartField(labs)) {
        return `Your record shows: ${flattenChartLines(labs)}. Does that match what you were told?`;
      }
      if (askedChart) {
        return "Those lab results aren't listed. Has the doctor ordered any for you?";
      }
      return "Got it.";
    }
    default:
      return null;
  }
}

/**
 * Patient-visible backup when the model is empty, recites the questionnaire,
 * or trips a reply ban. Opening a beat asks. Compare only after they named
 * something or asked for the file. HOLD_SAFE only when we truly cannot ground.
 */
export function checkInFailOpen(args: {
  topicId: string;
  topicFallback: string;
  hold?: boolean;
  vent?: boolean;
  mood?: boolean;
  userMessage?: string;
  values?: ChartFailOpenValues;
  isRpm?: boolean;
  lastAssistantText?: string;
  priorAssistantTexts?: string[];
  tone?: ClassifierResult;
}): string {
  const user = args.userMessage ?? "";
  const tone = args.tone;
  if (args.mood || tone?.sentiment === 'low_mood') return CHECK_IN_MOOD_SAFE_FALLBACK;
  if (tone?.askedHowAreYou) {
    const beatAsk = chartGroundedReply(args.topicId, args.values, {
      userMessage: "",
      isRpm: args.isRpm,
      lastAssistantText: args.lastAssistantText,
      priorAssistantTexts: args.priorAssistantTexts,
      tone,
    });
    return `I'm doing well, thank you for asking. ${beatAsk || args.topicFallback}`;
  }
  const named = tone?.namedChartTopic ?? null;
  const opts: ChartGroundOpts = {
    userMessage: user,
    lastAssistantText: args.lastAssistantText,
    priorAssistantTexts: args.priorAssistantTexts,
    isRpm: args.isRpm,
    tone,
  };
  if (named) {
    const namedChart = chartGroundedReply(named, args.values, opts);
    if (namedChart) return namedChart;
  }
  if (args.hold && tone?.flow === 'unclear') return CHECK_IN_HOLD_SAFE_FALLBACK;
  const chart = chartGroundedReply(args.topicId, args.values, opts);
  if (chart) {
    if (args.isRpm && tone?.readings && tone.readings.length > 0 && args.topicId !== "readings") {
      return `Got it. We don't need to recap device readings — those already come through. ${chart}`;
    }
    return chart;
  }
  if (args.vent) return CHECK_IN_VENT_SAFE_FALLBACK;
  if (args.hold) return CHECK_IN_HOLD_SAFE_FALLBACK;
  return args.topicFallback;
}

/** Compare spoken lines ignoring punctuation / case so parrot detection is stable. */
export function sameSpokenLine(a: string, b: string): boolean {
  const norm = (s: string) =>
    String(s ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const left = norm(a);
  const right = norm(b);
  return Boolean(left) && left === right;
}

/**
 * What to cover this turn.
 *
 * The topic is a beat, not a line to recite. `fallback` stays in code for
 * empty-generation fail-open — it is not offered as preferred wording.
 */
export function checkInAskInstruction(args: {
  topic: CheckInTopic;
  previous?: Pick<CheckInTopic, "label"> | null;
  skipped?: boolean;
  /** Stay on `topic` — patient still needs a response before the script moves. */
  hold?: boolean;
  /** Distress pause — listen; still answer if they asked something. */
  gentle?: boolean;
  /** Frustrated at the process / the assistant — acknowledge; do not re-ask. */
  vent?: boolean;
  /** Low mood — listen and offer a person; do not dump the chart. */
  mood?: boolean;
  /** RPM: never recap device readings. */
  isRpm?: boolean;
  /** Topic ids already answered or skipped this cycle — do not re-ask. */
  coveredIds?: string[];
}): string {
  if (args.mood) {
    return "They are feeling down. One warm line. Offer to connect them with a person on their care team if they want that. Do not ask them to clarify. Do not start another topic. Do not close the check-in.";
  }
  if (args.gentle) {
    return "They are distressed. If they asked a question, answer it from the Patient Profile. Do not ask them to clarify. Do not start another topic. Do not close the check-in.";
  }
  if (args.vent) {
    return "They are frustrated. Acknowledge that. If they asked a question, answer it from the Patient Profile. Do not repeat the last question. Do not ask them to clarify. Do not start another topic. Do not close the check-in.";
  }
  const rpmNote = args.isRpm ? " They are on RPM. Do not ask them to recap device readings." : "";
  const coveredIds = Array.isArray(args.coveredIds) ? args.coveredIds : [];
  const coveredLabels = CHECK_IN_TOPICS.filter((t) => coveredIds.includes(t.id) && t.id !== args.topic.id).map(
    (t) => t.id
  );
  const coveredNote = coveredLabels.length
    ? ` Already covered this cycle (do not re-ask): ${coveredLabels.join(", ")}.`
    : "";
  const script = args.topic.script ? ` (Guidance: ${args.topic.script})` : "";
  const ask =
    `CRITICAL RULE: If the patient asked a question or gave a command, answer it from the Patient Profile and DO NOT ask your check-in question this turn. ` +
    `If they did NOT ask a question, ask ONE question about ${args.topic.label} (id=${args.topic.id})${script}.${rpmNote}${coveredNote} ` +
    `Do not ask them to clarify. Do not start another topic. Do not close the check-in.`;
  if (args.hold) {
    return `Address their message naturally. DO NOT ask your check-in question this turn. Do not start another topic. If they mentioned a problem or asked a question, follow up on it.`;
  }
  if (!args.previous) return ask;
  if (args.skipped) return `They skipped "${args.previous.label}". Do not press it. ${ask}`;
  return `They just covered "${args.previous.label}". A short nod, then ${ask}`;
}

function isUsableCareName(name: string): boolean {
  const n = String(name ?? "").trim();
  if (!n) return false;
  const lower = n.toLowerCase();
  if (lower === "not recorded" || lower === "none") return false;
  if (lower === "your care manager") return false;
  return true;
}

/** How the nurse addresses the patient: Sir / Ma'am, then surname. Never first name. */
export function patientAddressForm(lastName?: string, gender?: string): string {
  const name = String(lastName ?? "").trim();
  if (!name) return "";
  const lower = name.toLowerCase();
  if (lower === "not recorded" || lower === "none") return "";
  const g = String(gender ?? "").trim().toLowerCase();
  if (g === "m" || g === "male" || g === "man") return `Mr. ${name}`;
  if (g === "f" || g === "female" || g === "woman") return `Miss ${name}`;
  return name;
}

/**
 * Opening SMS of a monthly cycle: intro + provider/practice.
 * Do not name the Care Manager. Identity (last name + DOB) is appended in
 * code; the first check-in question is asked only after that match.
 */
export function greetingCheckInInstruction(
  opts: { careManager?: string; provider?: string; practice?: string; lastName?: string; gender?: string } = {}
): string {
  const prov = String(opts.provider ?? "").trim();
  const practice = String(opts.practice ?? "").trim();
  const provOk = isUsableCareName(prov);
  const practiceOk = isUsableCareName(practice) && practice.toLowerCase() !== "your practice";

  const officeBit = [
    practiceOk ? `at ${practice}` : "",
    provOk ? `in ${prov}'s office` : "",
  ]
    .filter(Boolean)
    .join(" ");

  let teamBit =
    "Say you work under their Care Manager. Do not name the Care Manager. Do not invent staff names.";
  if (provOk) {
    teamBit = `Name their care provider (${prov}). Say you work under their Care Manager. Do not name the Care Manager.`;
  }

  const address = patientAddressForm(opts.lastName, opts.gender);
  const otherHonorific = address.toLowerCase().startsWith("mr") ? "Miss" : address.toLowerCase().startsWith("miss") ? "Mr." : "";
  const addressBit = address
    ? `Address them as ${address} and only ${address}.${otherHonorific ? ` Never ${otherHonorific}.` : ""} Never both Mr. and Miss. Do not change this because of how they talk.`
    : `Do not use a name or honorific to address them.`;

  return (
    `This is the OPENING message of the monthly check-in — there is no prior patient reply this cycle. ` +
    `Greet the patient formally (Good morning or Good afternoon). ${addressBit} Never use their first name. Do not open with Hi or Hey. ` +
    `Introduce yourself by name as their care assistant nurse${officeBit ? ` ${officeBit}` : ""}. ` +
    `${teamBit} ` +
    `Say you are starting their monthly care-management check-in. ` +
    `Do NOT ask how they are feeling yet. Do NOT ask any check-in questionnaire topic. ` +
    `Do not ask for last name or date of birth here (code appends that separately). ` +
    `Keep it to a few short sentences.`
  );
}

export const GREETING_FALLBACK =
  "I'm Lyra, your care assistant nurse, starting your monthly care-management check-in.";

export function generateHardcodedGreeting(
  opts: { aiName?: string; provider?: string; practice?: string; lastName?: string; gender?: string } = {}
): string {
  const prov = String(opts.provider ?? "").trim();
  const practice = String(opts.practice ?? "").trim();
  const provOk = isUsableCareName(prov);
  const practiceOk = isUsableCareName(practice) && practice.toLowerCase() !== "your practice";

  const address = patientAddressForm(opts.lastName, opts.gender) || "there";
  const aiName = opts.aiName || "Lyra";

  const officeBit = [
    practiceOk ? `at ${practice}` : "",
    provOk ? `in ${prov}'s office` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `Good morning, ${address}. I'm ${aiName}, your care assistant nurse${officeBit ? ` ${officeBit}` : ""}. I work under your Care Manager and I'm starting your monthly care-management check-in now.`;
}

const DAY_MS = 86_400_000;
const DEFAULT_CHECK_IN_INTERVAL_DAYS = 30;

export type CheckInProgressConvo = {
  status?: string;
  lastCheckInAt?: Date | string | null;
  nextCheckInAt?: Date | string | null;
  checkInClosedAt?: Date | string | null;
} | null | undefined;

function asTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/** When this cycle stops accepting the webchat link. */
export function checkInValidityEnd(
  convo: CheckInProgressConvo,
  intervalDays: number = DEFAULT_CHECK_IN_INTERVAL_DAYS
): Date | null {
  const next = asTime(convo?.nextCheckInAt);
  if (next) return new Date(next);
  const started = asTime(convo?.lastCheckInAt);
  if (!started) return null;
  const days = Math.max(1, Number(intervalDays) || DEFAULT_CHECK_IN_INTERVAL_DAYS);
  return new Date(started + days * DAY_MS);
}

/**
 * A live monthly check-in — the only time a webchat link is allowed to work.
 *
 * Opt-out, not-interested, a closed conversation, a finished questionnaire, a
 * cycle that was never started, or a cycle whose validity window has passed
 * are all "not in progress". The link is a door into that cycle, not a
 * standing credential.
 */
export function isGoalieCheckInInProgress(convo: CheckInProgressConvo, now: Date): boolean {
  if (!convo) return false;
  const status = String(convo.status ?? "active");
  if (status === "opted-out" || status === "not-interested" || status === "closed") return false;
  if (asTime(convo.checkInClosedAt)) return false;
  const started = asTime(convo.lastCheckInAt);
  if (!started) return false;
  const end = checkInValidityEnd(convo);
  if (!end || now.getTime() >= end.getTime()) return false;
  return now.getTime() >= started;
}
