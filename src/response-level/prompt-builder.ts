import { DEFAULT_GOALIE_SYSTEM_PROMPT, GOALIE_SAFETY_PREAMBLE } from './default-knowledge-base';
import { DEFAULT_GOALIE_TONE_PROMPT } from '../state-level/default-tone-prompt';

export interface GoalieChatTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface PatientProfile {
  addressAs?: string;
  age?: number;
  practiceName?: string;
  providerName?: string;
  programs?: string;
  conditions?: string;
  lastVisit?: string;
  medications?: string;
  vitals?: string;
  labs?: string;
  allergies?: string;
  diet?: string;
  activity?: string;
  carePlan?: string;
  goals?: string;
  barriers?: string;
  symptoms?: string;
  appointments?: string;
  nextCheckinAt?: string | Date;
  lastCheckin?: string;
  timezone?: string;
  preferredLanguage?: string;
  readingsAbnormal?: string;
}

export interface TurnControls {
  useAddressThisTurn: boolean;
  followupsRemaining: number;
  canOfferCareManager: boolean;
  bannedOpeners: string[];
  checkInInstruction: string;
}

export interface SystemPromptContextOpts {
  patient: PatientProfile;
  turnControls: TurnControls;
  tenantSystemPromptOverride?: string;
  tenantTimezone?: string;
  practiceTimezone?: string;
}

export interface TonePromptContextOpts {
  currentTopicId?: string;
  expectedAnswer?: string;
  lastNurseMessage?: string;
  recentTurns?: GoalieChatTurn[];
  priorSentiment?: string;
  inDistressPause?: boolean;
  openProblem?: string;
}

export function formatNextCheckIn(
  at: Date | string | null | undefined,
  timezones: string[]
): string {
  if (!at) return 'Not recorded';
  const d = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(d.getTime())) return 'Not recorded';
  
  let tzToUse = 'America/Chicago'; // Default to CST/CDT if none provided
  for (const tz of timezones) {
    if (!tz) continue;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      tzToUse = tz;
      break;
    } catch {
      // invalid timezone, try next
    }
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tzToUse,
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  }).formatToParts(d);

  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const month = g('month');
  const day = g('day');
  const hour = g('hour');
  const minute = g('minute');
  const dayPeriod = g('dayPeriod').toUpperCase();
  const timeZoneName = g('timeZoneName');

  if (!month || !day) return 'Not recorded';
  return `${month}/${day}, ${hour}:${minute} ${dayPeriod} ${timeZoneName}`;
}

function replacePlaceholdersSafely(template: string, replacements: Record<string, string>): string {
  // Single-pass replacement
  let prompt = template.replace(/\{\{[A-Z_]+\}\}/g, (match) => {
    if (replacements.hasOwnProperty(match)) {
      return replacements[match];
    }
    return match;
  });

  const placeholdersInTemplate = template.match(/\{\{[A-Z_]+\}\}/g) || [];
  const missing = placeholdersInTemplate.filter(p => {
    return !(p in replacements);
  });

  if (missing.length > 0) {
    const errorMsg = `Unreplaced placeholders found in prompt: ${missing.join(', ')}`;
    const env = process.env.NODE_ENV;
    if (env === 'test' || env === 'development') {
      throw new Error(errorMsg);
    } else {
      console.error(`[goalie] ${errorMsg}`);
      prompt = prompt.replace(new RegExp(missing.map(m => m.replace(/([{}])/g, '\\$1')).join('|'), 'g'), '');
    }
  }

  return prompt;
}

export function buildGoalieContext(opts: SystemPromptContextOpts): string {
  let basePrompt = opts.tenantSystemPromptOverride?.trim() || DEFAULT_GOALIE_SYSTEM_PROMPT;
  
  // Safety preamble is always first.
  const promptTemplate = `${GOALIE_SAFETY_PREAMBLE}\n\n${basePrompt}`;

  const p = opts.patient;
  const tc = opts.turnControls;

  const nextCheckinFormatted = formatNextCheckIn(p.nextCheckinAt, [
    p.timezone || '',
    opts.tenantTimezone || '',
    opts.practiceTimezone || ''
  ]);

  const replacements: Record<string, string> = {
    '{{PERSONA_NAME}}': 'Nurse Assistant',
    '{{PROVIDER_NAME}}': p.providerName || 'Not recorded',
    '{{PRACTICE_NAME}}': p.practiceName || 'Not recorded',
    '{{PATIENT_ADDRESS}}': p.addressAs || 'Not recorded',
    '{{REPLY_LANGUAGE}}': p.preferredLanguage || 'English',
    '{{USE_ADDRESS_THIS_TURN}}': tc.useAddressThisTurn ? 'yes' : 'no',
    '{{FOLLOWUPS_REMAINING}}': tc.followupsRemaining.toString(),
    '{{CAN_OFFER_CARE_MANAGER}}': tc.canOfferCareManager ? 'yes' : 'no',
    '{{BANNED_OPENERS}}': tc.bannedOpeners.length > 0 ? tc.bannedOpeners.join(', ') : 'none',
    '{{CHECK_IN_INSTRUCTION}}': tc.checkInInstruction || 'Not recorded',
    '{{PATIENT_AGE}}': p.age ? p.age.toString() : 'Not recorded',
    '{{PATIENT_PROGRAMS}}': p.programs || 'Not recorded',
    '{{PATIENT_CONDITIONS}}': p.conditions || 'Not recorded',
    '{{PATIENT_LAST_VISIT}}': p.lastVisit || 'Not recorded',
    '{{PATIENT_MEDICATIONS}}': p.medications || 'Not recorded',
    '{{PATIENT_VITALS}}': p.vitals || 'Not recorded',
    '{{PATIENT_READINGS_ABNORMAL}}': p.readingsAbnormal || 'Not recorded',
    '{{PATIENT_LABS}}': p.labs || 'Not recorded',
    '{{PATIENT_ALLERGIES}}': p.allergies || 'Not recorded',
    '{{PATIENT_DIET}}': p.diet || 'Not recorded',
    '{{PATIENT_ACTIVITY}}': p.activity || 'Not recorded',
    '{{PATIENT_CARE_PLAN}}': p.carePlan || 'Not recorded',
    '{{PATIENT_GOALS}}': p.goals || 'Not recorded',
    '{{PATIENT_BARRIERS}}': p.barriers || 'Not recorded',
    '{{PATIENT_SYMPTOMS}}': p.symptoms || 'Not recorded',
    '{{PATIENT_APPOINTMENTS}}': p.appointments || 'Not recorded',
    '{{NEXT_CHECKIN_AT}}': nextCheckinFormatted,
    '{{PATIENT_LAST_CHECKIN}}': p.lastCheckin || 'Not recorded',
  };

  return replacePlaceholdersSafely(promptTemplate, replacements);
}

export function buildToneContext(opts: TonePromptContextOpts): string {
  const recentTurnsFormatted = (opts.recentTurns || []).map(t => {
    const roleStr = t.role.toUpperCase();
    return `[${roleStr}]: ${t.content}`;
  }).join('\n');

  const replacements: Record<string, string> = {
    '{{CURRENT_TOPIC_ID}}': opts.currentTopicId || 'unknown',
    '{{EXPECTED_ANSWER}}': opts.expectedAnswer || 'unknown',
    '{{LAST_NURSE_MESSAGE}}': opts.lastNurseMessage || '(none)',
    '{{RECENT_TURNS}}': recentTurnsFormatted || '(none)',
    '{{PRIOR_SENTIMENT}}': opts.priorSentiment || 'neutral',
    '{{IN_DISTRESS_PAUSE}}': opts.inDistressPause ? 'true' : 'false',
    '{{OPEN_PROBLEM}}': opts.openProblem || 'none',
  };

  return replacePlaceholdersSafely(DEFAULT_GOALIE_TONE_PROMPT, replacements);
}
