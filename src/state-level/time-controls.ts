export function isBurstMessage(lastMessageTimeMs: number, newMessageTimeMs: number): boolean {
  // 2 minutes debounce
  return (newMessageTimeMs - lastMessageTimeMs) < (2 * 60 * 1000);
}

export function shouldSendSilenceReminder(lastActivityTimeMs: number, nowMs: number, stateName: string): boolean {
  if (stateName !== 'IN_CHECKIN' && stateName !== 'PENDING_FOLLOWUP') return false;
  // 24 hours
  return (nowMs - lastActivityTimeMs) >= (24 * 60 * 60 * 1000);
}

export function isDistressPauseExpired(pauseStartTimeMs: number, nowMs: number, stateName: string): boolean {
  if (stateName !== 'DISTRESS_PAUSE') return false;
  // 2 hours
  return (nowMs - pauseStartTimeMs) >= (2 * 60 * 60 * 1000);
}

export function shouldCloseMonth(lastActivityTimeMs: number, nowMs: number, stateName: string): boolean {
  if (stateName === 'CLOSED' || stateName === 'OPTED_OUT') return false;
  // 7 days of inactivity
  return (nowMs - lastActivityTimeMs) >= (7 * 24 * 60 * 60 * 1000);
}
