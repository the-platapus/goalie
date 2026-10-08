import { DirectiveType } from '../state-level/goalie-state-machine';

export interface ReplyValidatorContext {
  directive: DirectiveType;
  topicLabel?: string;
}

const APOLOGY_REGEX = /\b(sorry|apologize|apologies|my bad)\b/i;
const AI_ADMISSION_REGEX = /\b(ai|artificial intelligence|bot|automated|language model)\b/i;
// Reject markdown formatting like bold/italics (*, _), links ([]), headers (#)
const MARKDOWN_REGEX = /([*_]{1,2}.+?[*_]{1,2})|(#\s.+)|(\[.+\]\(.+\))/;

export const FALLBACK_REPLIES: Record<DirectiveType, string> = {
  topic_ask: "I want to make sure we cover everything. Let's move to the next topic.",
  follow_up: "I understand. Is there anything else you want to share about that?",
  rephrase: "I'm having trouble hearing you. Could you say that differently?",
  low_mood: "I'm glad you told me. I'm here with you. Would you like me to connect you with someone from your care team?",
  frustration: "I hear you. I'm not trying to talk over you. We can slow this down — tell me what you need from me right now.",
  medication_why: "Got it. Have you had any specific issues with your medicines?",
  alt_time: "When would be a better day or time for us to check in?",
  urgent_ack: "I've flagged this for your Care Manager to review today. Is there anything else you need me to pass along right now?",
  emergency: "If this is a medical emergency, please dial 911 or visit the nearest emergency room immediately. I am notifying your Care Manager.",
  not_the_patient: "Thank you for letting me know. For privacy reasons, I'll pause our check-in here and ask the Care Manager to follow up.",
  reschedule: "No problem. I will have your Care Manager reach out so we can find a better time.",
  chart_answer: "I want to make sure I give you the right information. Let me have your Care Manager look into this and get back to you.",
  resume_pause: "Okay, we can continue now.",
  closing: "That's everything for this month's check-in. We'll be in touch next month. If something changes before then, reach out to your Care Manager."
};

export function validateNurseReply(text: string, ctx: ReplyValidatorContext): { valid: boolean; reply: string; reason?: string } {
  const t = text.trim();

  if (t.length < 10) {
    return { valid: false, reply: FALLBACK_REPLIES[ctx.directive], reason: 'too_short' };
  }

  if (t.length > 600) {
    return { valid: false, reply: FALLBACK_REPLIES[ctx.directive], reason: 'too_long' };
  }

  if (APOLOGY_REGEX.test(t)) {
    return { valid: false, reply: FALLBACK_REPLIES[ctx.directive], reason: 'apology' };
  }

  if (AI_ADMISSION_REGEX.test(t)) {
    return { valid: false, reply: FALLBACK_REPLIES[ctx.directive], reason: 'ai_admission' };
  }

  if (MARKDOWN_REGEX.test(t)) {
    return { valid: false, reply: FALLBACK_REPLIES[ctx.directive], reason: 'markdown' };
  }

  return { valid: true, reply: t };
}
