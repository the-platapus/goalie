import { extractJsonObject, chatCompletionLimitParams, createChatCompletion, getOpenAIModel, usesCompletionTokensApi } from '../ai/openai-client';
import { buildToneContext, TonePromptContextOpts } from '../response-level/prompt-builder';
import { SELF_HARM_PHRASES, READING_BANDS } from './classifier-config';

export type FlowType = "continue" | "skip" | "wrap_up" | "emergency" | "resume" | "unclear";
export type SentimentType = "neutral" | "low_mood" | "distressed" | "frustrated";
export type SpecialRequestType = "billing" | "reschedule" | "not_the_patient" | "asked_if_automated" | "opt_out" | null;
export type MedicationAnswerType = "bare_yes" | "as_prescribed" | "named" | "negative" | "reason_given" | null;
export type NextCheckinAnswerType = "confirmed" | "declined" | null;

export interface ReadingItem {
  type: string;
  value: number;
  value2?: number | null;
  unit: string | null;
}

export interface ClassifierResult {
  flow: FlowType;
  urgent: boolean;
  sentiment: SentimentType;
  askedQuestion: boolean;
  askedHowAreYou: boolean;
  askedAboutChart: boolean;
  namedChartTopic: string | null;
  askedForChartSlice: boolean;
  specialRequest: SpecialRequestType;
  wantsCareManagerHelp: boolean;
  creditedTopics: string[];
  spokenTopicId: string | null;
  compareChart: boolean;
  medicationAnswer: MedicationAnswerType;
  extraMedicationName: string | null;
  nextCheckinAnswer: NextCheckinAnswerType;
  namedProblem: string | null;
  symptomPresent: boolean;
  readings: ReadingItem[];
  confidence: "high" | "medium" | "low";
}

export const SAFE_DEFAULT_CLASSIFIER_RESULT: ClassifierResult = {
  flow: "continue",
  urgent: true,
  sentiment: "neutral",
  askedQuestion: false,
  askedHowAreYou: false,
  askedAboutChart: false,
  namedChartTopic: null,
  askedForChartSlice: false,
  specialRequest: null,
  wantsCareManagerHelp: false,
  creditedTopics: [],
  spokenTopicId: null,
  compareChart: false,
  medicationAnswer: null,
  extraMedicationName: null,
  nextCheckinAnswer: null,
  namedProblem: null,
  symptomPresent: false,
  readings: [],
  confidence: "low"
};

export const OPT_OUT_KEYWORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit'];
export const HELP_KEYWORDS = ['help', 'info'];
export const SUBSCRIBE_KEYWORDS = ['start', 'unstop'];

function stripPunctuation(str: string): string {
  return str.replace(/[.,!?]/g, '').trim().toLowerCase();
}

export function checkCarrierKeywords(message: string): 'opt_out' | 'help' | 'subscribe' | null {
  const clean = stripPunctuation(message);
  if (OPT_OUT_KEYWORDS.includes(clean)) return 'opt_out';
  if (HELP_KEYWORDS.includes(clean)) return 'help';
  if (SUBSCRIBE_KEYWORDS.includes(clean)) return 'subscribe';
  return null;
}

export function checkSelfHarm(message: string): boolean {
  return SELF_HARM_PHRASES.some(regex => regex.test(message));
}

export function normalizeClassification(result: ClassifierResult): ClassifierResult {
  const norm = { ...result };
  if (norm.flow === 'emergency') {
    norm.urgent = false;
  }
  if (norm.specialRequest === 'opt_out' && norm.flow !== 'emergency') {
    norm.flow = 'wrap_up';
  }
  if (norm.askedAboutChart) {
    norm.askedQuestion = true;
  }
  return norm;
}

export function cToF(c: number): number {
  return (c * 9/5) + 32;
}

export function evaluateReadingBands(readings: ReadingItem[], symptomPresent: boolean): { emergency: boolean, urgent: boolean } {
  let hit = false;
  
  for (const r of readings) {
    const val = r.value;
    const type = r.type;
    
    if (type === 'blood_pressure') {
      const v2 = r.value2;
      if (val >= READING_BANDS.blood_pressure.systolic_implausible_high || val <= READING_BANDS.blood_pressure.systolic_implausible_low) {
        console.warn(`[goalie] Implausible BP systolic ignored: ${val}`);
        continue;
      }
      if (v2 !== undefined && v2 !== null) {
        if (v2 >= READING_BANDS.blood_pressure.diastolic_implausible_high || v2 <= READING_BANDS.blood_pressure.diastolic_implausible_low) {
          console.warn(`[goalie] Implausible BP diastolic ignored: ${v2}`);
          continue;
        }
      }
      if (val > READING_BANDS.blood_pressure.systolic_high || (v2 && v2 > READING_BANDS.blood_pressure.diastolic_high)) {
        hit = true;
      }
    } else if (type === 'oxygen') {
      if (val <= READING_BANDS.oxygen.implausible_low) {
        console.warn(`[goalie] Implausible oxygen ignored: ${val}`);
        continue;
      }
      if (val <= READING_BANDS.oxygen.low) {
        hit = true;
      }
    } else if (type === 'temperature') {
      let tempF = val;
      if (r.unit && r.unit.toLowerCase().includes('c')) {
        tempF = cToF(val);
      }
      if (tempF >= READING_BANDS.temperature.implausible_high || tempF <= READING_BANDS.temperature.implausible_low) {
         console.warn(`[goalie] Implausible temperature ignored: ${val}`);
         continue;
      }
      if (tempF > READING_BANDS.temperature.high) {
        hit = true;
      }
    } else if (type === 'heart_rate') {
      if (val >= READING_BANDS.heart_rate.implausible_high || val <= READING_BANDS.heart_rate.implausible_low) {
        console.warn(`[goalie] Implausible heart rate ignored: ${val}`);
        continue;
      }
      if (val < READING_BANDS.heart_rate.low || val > READING_BANDS.heart_rate.high) {
        hit = true;
      }
    }
  }

  if (hit) {
    if (symptomPresent) return { emergency: true, urgent: false };
    return { emergency: false, urgent: true };
  }
  
  return { emergency: false, urgent: false };
}

export function deriveReadiness(result: ClassifierResult, followUpsExhausted: boolean): boolean {
  return result.flow === 'continue' &&
    !result.askedQuestion &&
    !result.askedHowAreYou &&
    result.sentiment === 'neutral' &&
    result.specialRequest === null &&
    !result.urgent &&
    (result.namedProblem === null || followUpsExhausted) &&
    result.medicationAnswer !== 'negative' &&
    result.nextCheckinAnswer !== 'declined';
}

function parseModelOutput(content: string): ClassifierResult {
  const extracted = extractJsonObject(content);
  if (!extracted.ok) {
    return SAFE_DEFAULT_CLASSIFIER_RESULT;
  }
  
  const v = extracted.value || {};
  
  // enforce enums and types, strip unknown
  const flow = ['continue', 'skip', 'wrap_up', 'emergency', 'resume', 'unclear'].includes(v.flow) ? v.flow : 'continue';
  const urgent = !!v.urgent;
  const sentiment = ['neutral', 'low_mood', 'distressed', 'frustrated'].includes(v.sentiment) ? v.sentiment : 'neutral';
  
  return {
    flow,
    urgent,
    sentiment,
    askedQuestion: !!v.askedQuestion,
    askedHowAreYou: !!v.askedHowAreYou,
    askedAboutChart: !!v.askedAboutChart,
    namedChartTopic: ['medications', 'readings', 'diet', 'activity', 'labs'].includes(v.namedChartTopic) ? v.namedChartTopic : null,
    askedForChartSlice: !!v.askedForChartSlice,
    specialRequest: ['billing', 'reschedule', 'not_the_patient', 'asked_if_automated', 'opt_out'].includes(v.specialRequest) ? v.specialRequest : null,
    wantsCareManagerHelp: !!v.wantsCareManagerHelp,
    creditedTopics: Array.isArray(v.creditedTopics) ? v.creditedTopics.map(String) : [],
    spokenTopicId: ['feeling', 'symptoms', 'medications', 'readings', 'labs', 'diet', 'activity', 'care_help', 'next_checkin'].includes(v.spokenTopicId) ? v.spokenTopicId : null,
    compareChart: !!v.compareChart,
    medicationAnswer: ['bare_yes', 'as_prescribed', 'named', 'negative', 'reason_given'].includes(v.medicationAnswer) ? v.medicationAnswer : null,
    extraMedicationName: v.extraMedicationName && typeof v.extraMedicationName === 'string' ? v.extraMedicationName : null,
    nextCheckinAnswer: ['confirmed', 'declined'].includes(v.nextCheckinAnswer) ? v.nextCheckinAnswer : null,
    namedProblem: v.namedProblem && typeof v.namedProblem === 'string' ? v.namedProblem : null,
    symptomPresent: !!v.symptomPresent,
    readings: Array.isArray(v.readings) ? v.readings.map((r: any) => ({
      type: r.type || 'unknown',
      value: Number(r.value) || 0,
      value2: r.value2 ? Number(r.value2) : null,
      unit: r.unit || null
    })) : [],
    confidence: ['high', 'medium', 'low'].includes(v.confidence) ? v.confidence : 'low'
  };
}

export async function assessPatientTone(
  userMessage: string,
  opts: TonePromptContextOpts = {}
): Promise<ClassifierResult> {
  const keywordMatch = checkCarrierKeywords(userMessage);
  if (keywordMatch === 'opt_out') {
    return normalizeClassification({
      ...SAFE_DEFAULT_CLASSIFIER_RESULT,
      flow: 'wrap_up',
      specialRequest: 'opt_out',
      confidence: 'high'
    });
  } else if (keywordMatch === 'help' || keywordMatch === 'subscribe') {
    // These should ideally be intercepted earlier by the SMS webhook, 
    // but if they reach here we wrap up so we don't treat it as a check-in answer
    return normalizeClassification({
      ...SAFE_DEFAULT_CLASSIFIER_RESULT,
      flow: 'wrap_up',
      confidence: 'high'
    });
  }

  if (checkSelfHarm(userMessage)) {
    return normalizeClassification({
      ...SAFE_DEFAULT_CLASSIFIER_RESULT,
      flow: 'emergency',
      urgent: false,
      symptomPresent: true,
      confidence: 'high'
    });
  }

  const systemPrompt = buildToneContext(opts);
  
  // escape closing tag to prevent prompt injection
  const safeMessage = userMessage.replace(/<\/patient_message>/g, '<\\/patient_message>');
  const fencedMessage = `<patient_message>\n${safeMessage}\n</patient_message>`;

  const model = getOpenAIModel();
  const tokenBudget = usesCompletionTokensApi(model) ? 400 : 160;

  let result = SAFE_DEFAULT_CLASSIFIER_RESULT;
  try {
    const res = await createChatCompletion({
      model,
      ...chatCompletionLimitParams(model, tokenBudget, 0.0, "low"),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: fencedMessage },
      ],
    });
    
    result = parseModelOutput(res.choices?.[0]?.message?.content ?? "");
  } catch (err) {
    console.warn("[goalie] tone classify failed, retrying once:", (err as Error)?.message || err);
    try {
      const res2 = await createChatCompletion({
        model,
        ...chatCompletionLimitParams(model, tokenBudget, 0.0, "low"),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: fencedMessage },
        ],
      });
      result = parseModelOutput(res2.choices?.[0]?.message?.content ?? "");
    } catch (err2) {
      console.warn("[goalie] tone classify retry failed:", (err2 as Error)?.message || err2);
      result = SAFE_DEFAULT_CLASSIFIER_RESULT;
    }
  }

  return normalizeClassification(result);
}
