import { describe, it, expect } from 'vitest';
import { validateNurseReply, FALLBACK_REPLIES } from './reply-validator';

describe('reply-validator', () => {
  it('accepts a valid reply', () => {
    const text = "Good morning Mr. Smith, I am checking in on your medications today.";
    const result = validateNurseReply(text, { directive: 'topic_ask' });
    expect(result.valid).toBe(true);
    expect(result.reply).toBe(text);
  });

  it('rejects replies that are too short', () => {
    const text = "Okay.";
    const result = validateNurseReply(text, { directive: 'topic_ask' });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('too_short');
    expect(result.reply).toBe(FALLBACK_REPLIES['topic_ask']);
  });

  it('rejects replies that are too long', () => {
    const text = "A".repeat(601);
    const result = validateNurseReply(text, { directive: 'follow_up' });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('too_long');
    expect(result.reply).toBe(FALLBACK_REPLIES['follow_up']);
  });

  it('rejects apologies', () => {
    const text = "I am so sorry to hear that you are feeling poorly.";
    const result = validateNurseReply(text, { directive: 'low_mood' });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('apology');
    expect(result.reply).toBe(FALLBACK_REPLIES['low_mood']);
  });

  it('rejects AI admission', () => {
    const text = "As an AI, I am unable to write prescriptions.";
    const result = validateNurseReply(text, { directive: 'chart_answer' });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('ai_admission');
    expect(result.reply).toBe(FALLBACK_REPLIES['chart_answer']);
  });

  it('rejects markdown formatting', () => {
    const text = "Please take your **medications** as prescribed.";
    const result = validateNurseReply(text, { directive: 'medication_why' });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('markdown');
    expect(result.reply).toBe(FALLBACK_REPLIES['medication_why']);
  });

  it('rejects links', () => {
    const text = "You can read more [here](http://example.com).";
    const result = validateNurseReply(text, { directive: 'chart_answer' });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('markdown');
  });

  it('accepts safe punctuation', () => {
    const text = "That's great! Are you taking your pills, eating well, and resting?";
    const result = validateNurseReply(text, { directive: 'topic_ask' });
    expect(result.valid).toBe(true);
    expect(result.reply).toBe(text);
  });
});
