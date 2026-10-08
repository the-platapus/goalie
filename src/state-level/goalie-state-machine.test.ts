import { describe, it, expect } from 'vitest';
import { 
  createInitialState, 
  computeTurnControls, 
  transition, 
  StateMachineData,
  TransitionContext
} from './goalie-state-machine';
import { SAFE_DEFAULT_CLASSIFIER_RESULT } from './goalie-classifier';

describe('goalie-state-machine', () => {
  describe('computeTurnControls', () => {
    it('uses address on first turn', () => {
      const state = createInitialState('m1');
      const controls = computeTurnControls(state);
      expect(controls.useAddressThisTurn).toBe(true);
    });

    it('does not use address on second turn', () => {
      const state = createInitialState('m1');
      state.turnIndex = 1;
      state.lastHonorificTurnIndex = 0;
      const controls = computeTurnControls(state);
      expect(controls.useAddressThisTurn).toBe(false);
    });

    it('uses address if 4 turns passed since last use', () => {
      const state = createInitialState('m1');
      state.turnIndex = 4;
      state.lastHonorificTurnIndex = 0;
      const controls = computeTurnControls(state);
      expect(controls.useAddressThisTurn).toBe(true);
    });

    it('computes followups remaining', () => {
      const state = createInitialState('m1');
      state.openProblem = 'headache';
      state.followUpCounts = { 'headache': 1 };
      const controls = computeTurnControls(state);
      expect(controls.followupsRemaining).toBe(1);
    });
  });

  describe('transition', () => {
    const ctx: TransitionContext = { isRpm: false, messageId: 'msg1' };

    it('idempotency: ignores already processed message', () => {
      const state = createInitialState('m1');
      state.processedInboundMessageIds = ['msg1'];
      const res = transition(state, SAFE_DEFAULT_CLASSIFIER_RESULT, ctx);
      expect(res.nextState.version).toBe(1); // Unchanged
    });

    it('emergency transitions to HANDOFF', () => {
      const state = createInitialState('m1');
      const res = transition(state, { ...SAFE_DEFAULT_CLASSIFIER_RESULT, flow: 'emergency' }, ctx);
      expect(res.nextState.state).toBe('HANDOFF');
      expect(res.directive).toBe('emergency');
      expect(res.sideEffects).toContainEqual(expect.objectContaining({ alertToCareManager: 'emergency' }));
    });

    it('opt_out transitions to OPTED_OUT', () => {
      const state = createInitialState('m1');
      const res = transition(state, { ...SAFE_DEFAULT_CLASSIFIER_RESULT, specialRequest: 'opt_out' }, ctx);
      expect(res.nextState.state).toBe('OPTED_OUT');
      expect(res.directive).toBe('closing');
    });

    it('namedProblem enters PENDING_FOLLOWUP', () => {
      const state = createInitialState('m1');
      const res = transition(state, { ...SAFE_DEFAULT_CLASSIFIER_RESULT, namedProblem: 'pain', symptomPresent: true, urgent: false }, ctx);
      expect(res.nextState.state).toBe('PENDING_FOLLOWUP');
      expect(res.nextState.openProblem).toBe('pain');
      expect(res.directive).toBe('follow_up');
    });

    it('exhausts followups', () => {
      const state = createInitialState('m1');
      state.state = 'PENDING_FOLLOWUP';
      state.openProblem = 'pain';
      state.followUpCounts = { 'pain': 2 }; // Already 2
      const res = transition(state, { ...SAFE_DEFAULT_CLASSIFIER_RESULT, namedProblem: 'pain', symptomPresent: true, urgent: false }, ctx);
      // It should clear openProblem and advance
      expect(res.nextState.openProblem).toBeNull();
      expect(res.nextState.state).toBe('IN_CHECKIN');
      expect(res.directive).toBe('topic_ask');
    });

    it('skips RPM readings', () => {
      const state = createInitialState('m1');
      // Assume feelings and meds are credited, next is readings
      state.creditedSet = ['feeling', 'symptoms', 'medications'];
      const rpmCtx = { ...ctx, isRpm: true, messageId: 'msg2' };
      const res = transition(state, SAFE_DEFAULT_CLASSIFIER_RESULT, rpmCtx);
      // It should skip readings and ask about labs (or whatever is next)
      expect(state.topicOrder[res.nextState.currentTopicIndex]).not.toBe('readings');
    });
  });
});
