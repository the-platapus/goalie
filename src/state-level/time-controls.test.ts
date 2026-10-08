import { describe, it, expect } from 'vitest';
import { 
  isBurstMessage, 
  shouldSendSilenceReminder, 
  isDistressPauseExpired, 
  shouldCloseMonth 
} from './time-controls';

describe('time-controls', () => {
  it('detects burst messages under 2 minutes', () => {
    expect(isBurstMessage(100000, 150000)).toBe(true); // 50 seconds
    expect(isBurstMessage(100000, 300000)).toBe(false); // 200 seconds (> 2 min)
  });

  it('determines if silence reminder is needed after 24h', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    expect(shouldSendSilenceReminder(0, DAY_MS, 'IN_CHECKIN')).toBe(true);
    expect(shouldSendSilenceReminder(0, DAY_MS, 'CLOSED')).toBe(false);
    expect(shouldSendSilenceReminder(0, DAY_MS - 1000, 'IN_CHECKIN')).toBe(false);
  });

  it('determines if distress pause is expired after 2 hours', () => {
    const HOUR_MS = 60 * 60 * 1000;
    expect(isDistressPauseExpired(0, 2 * HOUR_MS, 'DISTRESS_PAUSE')).toBe(true);
    expect(isDistressPauseExpired(0, 2 * HOUR_MS, 'IN_CHECKIN')).toBe(false); // wrong state
    expect(isDistressPauseExpired(0, HOUR_MS, 'DISTRESS_PAUSE')).toBe(false); // 1 hr < 2 hr
  });

  it('determines if month should be closed after 7 days', () => {
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    expect(shouldCloseMonth(0, WEEK_MS, 'IN_CHECKIN')).toBe(true);
    expect(shouldCloseMonth(0, WEEK_MS, 'CLOSED')).toBe(false); // Already closed
    expect(shouldCloseMonth(0, WEEK_MS - 1000, 'IN_CHECKIN')).toBe(false); // Just under 7 days
  });
});
