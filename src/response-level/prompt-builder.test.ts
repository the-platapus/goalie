import { describe, it, expect } from 'vitest';
import { 
  buildGoalieContext, 
  buildToneContext, 
  PatientProfile,
  TurnControls
} from './prompt-builder';
import { GOALIE_SAFETY_PREAMBLE } from './default-knowledge-base';

describe('prompt-builder', () => {
  const defaultPatient: PatientProfile = {
    addressAs: 'Mr. Smith',
    age: 70,
    practiceName: 'Main St Clinic',
    providerName: 'Dr. Jones',
    programs: 'CCM, RPM',
    conditions: 'Hypertension',
    lastVisit: '2023-10-01',
    medications: 'Lisinopril',
    vitals: 'BP 120/80',
    labs: 'A1C 6.5',
    allergies: 'None',
    diet: 'Low sodium',
    activity: 'Walking',
    carePlan: 'Control BP',
    goals: 'Weight loss',
    barriers: 'None',
    symptoms: 'Fatigue',
    appointments: 'None',
    nextCheckinAt: new Date('2023-10-14T14:30:00Z'),
    lastCheckin: 'Feeling good',
    timezone: 'America/Chicago',
    preferredLanguage: 'English',
    readingsAbnormal: 'None'
  };

  const defaultTurnControls: TurnControls = {
    useAddressThisTurn: true,
    followupsRemaining: 1,
    canOfferCareManager: false,
    bannedOpeners: ['Got it'],
    checkInInstruction: 'Ask about medications.'
  };

  it('renders all placeholders for RPM patients with no unreplaced tags', () => {
    const prompt = buildGoalieContext({
      patient: defaultPatient,
      turnControls: defaultTurnControls
    });
    
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(prompt.startsWith(GOALIE_SAFETY_PREAMBLE)).toBe(true);
  });

  it('renders all placeholders for non-RPM patients with no unreplaced tags', () => {
    const prompt = buildGoalieContext({
      patient: { ...defaultPatient, programs: 'CCM' },
      turnControls: defaultTurnControls
    });
    
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('handles empty fields gracefully (renders Not recorded)', () => {
    const prompt = buildGoalieContext({
      patient: {}, // all empty
      turnControls: defaultTurnControls
    });
    
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(prompt).toContain('Not recorded');
  });

  it('enforces safety preamble first even with tenant override', () => {
    const prompt = buildGoalieContext({
      patient: defaultPatient,
      turnControls: defaultTurnControls,
      tenantSystemPromptOverride: 'TENANT_OVERRIDE_TEXT'
    });
    
    expect(prompt.startsWith(GOALIE_SAFETY_PREAMBLE)).toBe(true);
    expect(prompt).toContain('TENANT_OVERRIDE_TEXT');
    // It should not contain the default system prompt if overridden
    expect(prompt).not.toContain('You are a care assistant nurse in a doctor\'s office.');
  });

  it('formats NEXT_CHECKIN_AT with patient timezone', () => {
    const prompt = buildGoalieContext({
      patient: {
        ...defaultPatient,
        timezone: 'Europe/Paris',
        nextCheckinAt: new Date('2023-10-14T14:30:00Z')
      },
      turnControls: defaultTurnControls
    });
    // 14:30 UTC -> 16:30 CEST
    expect(prompt).toContain('10/14, 4:30 PM GMT+2'); // Note: timeZoneName='short' might format differently depending on node version, but it shouldn't contain unreplaced placeholders.
  });

  it('formats NEXT_CHECKIN_AT with DST transition', () => {
    // Nov 5, 2023 is DST end in US
    const prompt = buildGoalieContext({
      patient: {
        ...defaultPatient,
        timezone: 'America/Chicago',
        nextCheckinAt: new Date('2023-11-05T14:30:00Z') // 14:30 UTC is 08:30 CST
      },
      turnControls: defaultTurnControls
    });
    expect(prompt).toContain('11/05, 8:30 AM CST');
  });

  it('throws in test environment if unreplaced placeholders exist', () => {
    // We can't really test this easily without modifying the template to have a bad placeholder, 
    // but we know the function throws. 
    // Let's pass a bad template through tenant override.
    expect(() => {
      buildGoalieContext({
        patient: defaultPatient,
        turnControls: defaultTurnControls,
        tenantSystemPromptOverride: 'This has a {{BAD_TAG}}'
      });
    }).toThrow(/Unreplaced placeholders/);
  });

  it('buildToneContext replaces all placeholders', () => {
    const tonePrompt = buildToneContext({
      currentTopicId: 'medications',
      expectedAnswer: 'bare_yes',
      lastNurseMessage: 'Are you taking them?',
      recentTurns: [{ role: 'user', content: 'yes' }],
      priorSentiment: 'neutral',
      inDistressPause: false,
      openProblem: 'none'
    });
    
    expect(tonePrompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });
});
