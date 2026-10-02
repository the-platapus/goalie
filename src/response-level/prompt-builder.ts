import { DEFAULT_ENGAGE_SYSTEM_PROMPT } from './default-knowledge-base';

export interface EngageChatTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface PatientProfile {
  firstName: string;
  lastName: string;
  addressAs: string;
  age: number;
  gender: string;
  dob: string;
  phone: string;
  email: string;
  practiceName: string;
  providerName: string;
  programs: string;
  conditions: string;
  lastVisit: string;
  medications: string;
  vitals: string;
  labs: string;
  allergies: string;
  diet: string;
  activity: string;
  carePlan: string;
  goals: string;
  barriers: string;
  symptoms: string;
  appointments: string;
  nextCheckinAt: string;
  lastCheckin: string;
}

export function buildEngageContext(patient: PatientProfile, checkInInstruction: string, readingsNormalCount: number, readingsAbnormal: string): string {
  let prompt = DEFAULT_ENGAGE_SYSTEM_PROMPT;

  const replacements: Record<string, string> = {
    '{{PERSONA_NAME}}': 'Nurse Assistant',
    '{{PROVIDER_NAME}}': patient.providerName || 'Not recorded',
    '{{PRACTICE_NAME}}': patient.practiceName || 'Not recorded',
    '{{PATIENT_ADDRESS}}': patient.addressAs || 'Not recorded',
    '{{PATIENT_FIRST_NAME}}': patient.firstName || 'Not recorded',
    '{{PATIENT_LAST_NAME}}': patient.lastName || 'Not recorded',
    '{{PATIENT_AGE}}': patient.age ? patient.age.toString() : 'Not recorded',
    '{{PATIENT_GENDER}}': patient.gender || 'Not recorded',
    '{{PATIENT_DOB}}': patient.dob || 'Not recorded',
    '{{PATIENT_PHONE}}': patient.phone || 'Not recorded',
    '{{PATIENT_EMAIL}}': patient.email || 'Not recorded',
    '{{PATIENT_PROGRAMS}}': patient.programs || 'Not recorded',
    '{{PATIENT_CONDITIONS}}': patient.conditions || 'Not recorded',
    '{{PATIENT_LAST_VISIT}}': patient.lastVisit || 'Not recorded',
    '{{PATIENT_MEDICATIONS}}': patient.medications || 'Not recorded',
    '{{PATIENT_VITALS}}': patient.vitals || 'Not recorded',
    '{{PATIENT_LABS}}': patient.labs || 'Not recorded',
    '{{PATIENT_ALLERGIES}}': patient.allergies || 'Not recorded',
    '{{PATIENT_DIET}}': patient.diet || 'Not recorded',
    '{{PATIENT_ACTIVITY}}': patient.activity || 'Not recorded',
    '{{PATIENT_CARE_PLAN}}': patient.carePlan || 'Not recorded',
    '{{PATIENT_GOALS}}': patient.goals || 'Not recorded',
    '{{PATIENT_BARRIERS}}': patient.barriers || 'Not recorded',
    '{{PATIENT_SYMPTOMS}}': patient.symptoms || 'Not recorded',
    '{{PATIENT_APPOINTMENTS}}': patient.appointments || 'Not recorded',
    '{{NEXT_CHECKIN_AT}}': patient.nextCheckinAt || 'Not recorded',
    '{{PATIENT_LAST_CHECKIN}}': patient.lastCheckin || 'Not recorded',
    '{{CHECK_IN_INSTRUCTION}}': checkInInstruction || 'Not recorded',
    '{{PATIENT_READINGS_NORMAL_COUNT}}': readingsNormalCount.toString(),
    '{{PATIENT_READINGS_ABNORMAL}}': readingsAbnormal || 'Not recorded',
  };

  for (const [key, value] of Object.entries(replacements)) {
    prompt = prompt.split(key).join(value);
  }

  return prompt;
}
