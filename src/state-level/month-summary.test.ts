import { describe, it, expect } from 'vitest';
import { buildClinicalSummary } from './month-summary';
import { createInitialState } from './goalie-state-machine';

describe('month-summary', () => {
  it('builds clinical summary accurately', () => {
    const state = createInitialState('m1');
    state.state = 'CLOSED';
    state.creditedSet = ['feeling', 'medications'];
    state.skippedSet = ['readings'];
    // Remaining should be symptoms, labs, diet, activity, care_help, next_checkin
    
    const summary = buildClinicalSummary(state);
    
    expect(summary).toContain('Check-in closed (CLOSED).');
    expect(summary).toContain('Topics covered: feeling, medications');
    expect(summary).toContain('Topics skipped: readings');
    expect(summary).toContain('Remaining topics: symptoms, labs, diet, activity, care_help, next_checkin');
  });

  it('handles empty sets', () => {
    const state = createInitialState('m1');
    state.state = 'IN_CHECKIN';
    const summary = buildClinicalSummary(state);
    
    expect(summary).toContain('Check-in active (IN_CHECKIN).');
    expect(summary).toContain('Topics covered: None');
    expect(summary).toContain('Topics skipped: None');
    expect(summary).toContain('feeling, symptoms, medications, readings, labs, diet, activity, care_help, next_checkin');
  });
});
