import { describe, it, expect } from 'vitest';
import { 
  normalizeClassification, 
  evaluateReadingBands, 
  deriveReadiness, 
  ClassifierResult, 
  SAFE_DEFAULT_CLASSIFIER_RESULT,
  checkCarrierKeywords,
  checkSelfHarm
} from './goalie-classifier';

describe('goalie-classifier', () => {
  describe('normalizeClassification', () => {
    it.each([
      {
        name: 'emergency forces urgent false',
        input: { ...SAFE_DEFAULT_CLASSIFIER_RESULT, flow: 'emergency', urgent: true } as ClassifierResult,
        expected: { flow: 'emergency', urgent: false }
      },
      {
        name: 'opt_out forces wrap_up if not emergency',
        input: { ...SAFE_DEFAULT_CLASSIFIER_RESULT, flow: 'continue', specialRequest: 'opt_out' } as ClassifierResult,
        expected: { flow: 'wrap_up', specialRequest: 'opt_out' }
      },
      {
        name: 'opt_out does not override emergency',
        input: { ...SAFE_DEFAULT_CLASSIFIER_RESULT, flow: 'emergency', specialRequest: 'opt_out' } as ClassifierResult,
        expected: { flow: 'emergency', specialRequest: 'opt_out' }
      },
      {
        name: 'askedAboutChart forces askedQuestion true',
        input: { ...SAFE_DEFAULT_CLASSIFIER_RESULT, askedAboutChart: true, askedQuestion: false } as ClassifierResult,
        expected: { askedAboutChart: true, askedQuestion: true }
      }
    ])('$name', ({ input, expected }) => {
      const res = normalizeClassification(input);
      for (const [k, v] of Object.entries(expected)) {
        expect(res[k as keyof ClassifierResult]).toBe(v);
      }
    });
  });

  describe('evaluateReadingBands', () => {
    it.each([
      { name: 'no readings', readings: [], symptomPresent: false, expectEmergency: false, expectUrgent: false },
      
      // Blood Pressure
      { name: 'BP below threshold', readings: [{ type: 'blood_pressure', value: 170, value2: 100, unit: 'mmHg' }], symptomPresent: false, expectEmergency: false, expectUrgent: false },
      { name: 'BP systolic high without symptom', readings: [{ type: 'blood_pressure', value: 185, value2: 100, unit: 'mmHg' }], symptomPresent: false, expectEmergency: false, expectUrgent: true },
      { name: 'BP systolic high with symptom', readings: [{ type: 'blood_pressure', value: 185, value2: 100, unit: 'mmHg' }], symptomPresent: true, expectEmergency: true, expectUrgent: false },
      { name: 'BP diastolic high with symptom', readings: [{ type: 'blood_pressure', value: 170, value2: 115, unit: 'mmHg' }], symptomPresent: true, expectEmergency: true, expectUrgent: false },
      { name: 'implausible high BP ignored', readings: [{ type: 'blood_pressure', value: 305, value2: 100, unit: 'mmHg' }], symptomPresent: true, expectEmergency: false, expectUrgent: false },
      
      // Oxygen
      { name: 'oxygen below threshold without symptom', readings: [{ type: 'oxygen', value: 87, unit: '%' }], symptomPresent: false, expectEmergency: false, expectUrgent: true },
      { name: 'oxygen exactly 88 with symptom', readings: [{ type: 'oxygen', value: 88, unit: '%' }], symptomPresent: true, expectEmergency: true, expectUrgent: false },
      { name: 'implausible low oxygen ignored', readings: [{ type: 'oxygen', value: 45, unit: '%' }], symptomPresent: true, expectEmergency: false, expectUrgent: false },

      // Temperature
      { name: 'temp above 102F with symptom', readings: [{ type: 'temperature', value: 103, unit: 'F' }], symptomPresent: true, expectEmergency: true, expectUrgent: false },
      { name: 'temp converted from C', readings: [{ type: 'temperature', value: 39.5, unit: 'C' }], symptomPresent: true, expectEmergency: true, expectUrgent: false }, // 39.5C = 103.1F
      { name: 'implausible temp ignored', readings: [{ type: 'temperature', value: 115, unit: 'F' }], symptomPresent: true, expectEmergency: false, expectUrgent: false },

      // Heart Rate
      { name: 'HR below 50 with symptom', readings: [{ type: 'heart_rate', value: 45, unit: 'bpm' }], symptomPresent: true, expectEmergency: true, expectUrgent: false },
      { name: 'HR above 120 with symptom', readings: [{ type: 'heart_rate', value: 125, unit: 'bpm' }], symptomPresent: true, expectEmergency: true, expectUrgent: false },
      { name: 'HR exactly 50 is fine', readings: [{ type: 'heart_rate', value: 50, unit: 'bpm' }], symptomPresent: true, expectEmergency: false, expectUrgent: false },
    ])('$name', ({ readings, symptomPresent, expectEmergency, expectUrgent }) => {
      const res = evaluateReadingBands(readings as any, symptomPresent);
      expect(res.emergency).toBe(expectEmergency);
      expect(res.urgent).toBe(expectUrgent);
    });
  });

  describe('deriveReadiness', () => {
    it.each([
      { 
        name: 'perfect continue state', 
        result: { ...SAFE_DEFAULT_CLASSIFIER_RESULT, flow: 'continue', urgent: false }, 
        followUpsExhausted: false, 
        expected: true 
      },
      { 
        name: 'not ready if flow is not continue', 
        result: { ...SAFE_DEFAULT_CLASSIFIER_RESULT, flow: 'wrap_up', urgent: false }, 
        followUpsExhausted: false, 
        expected: false 
      },
      { 
        name: 'not ready if asked question', 
        result: { ...SAFE_DEFAULT_CLASSIFIER_RESULT, flow: 'continue', urgent: false, askedQuestion: true }, 
        followUpsExhausted: false, 
        expected: false 
      },
      { 
        name: 'not ready if urgent', 
        result: { ...SAFE_DEFAULT_CLASSIFIER_RESULT, flow: 'continue', urgent: true }, 
        followUpsExhausted: false, 
        expected: false 
      },
      { 
        name: 'not ready if named problem and followUps NOT exhausted', 
        result: { ...SAFE_DEFAULT_CLASSIFIER_RESULT, flow: 'continue', urgent: false, namedProblem: 'headache' }, 
        followUpsExhausted: false, 
        expected: false 
      },
      { 
        name: 'ready if named problem BUT followUps ARE exhausted', 
        result: { ...SAFE_DEFAULT_CLASSIFIER_RESULT, flow: 'continue', urgent: false, namedProblem: 'headache' }, 
        followUpsExhausted: true, 
        expected: true 
      },
    ])('$name', ({ result, followUpsExhausted, expected }) => {
      expect(deriveReadiness(result as ClassifierResult, followUpsExhausted)).toBe(expected);
    });
  });

  describe('backstops', () => {
    it('detects opt out keywords', () => {
      expect(checkCarrierKeywords('STOP')).toBe('opt_out');
      expect(checkCarrierKeywords('unsubscribe.')).toBe('opt_out');
      expect(checkCarrierKeywords('I stopped taking it')).toBeNull(); // multi-word string fails exact match
    });

    it('detects self harm phrases', () => {
      expect(checkSelfHarm('my headache is killing me')).toBe(false);
      expect(checkSelfHarm('I want to die')).toBe(true);
      expect(checkSelfHarm('I think I should just commit suicide')).toBe(true);
    });
  });
});
