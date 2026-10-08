/**
 * Clinician sign-off required for thresholds and self-harm phrases.
 */

export const SELF_HARM_PHRASES = [
  // exact or partial matches indicating imminent harm. 
  // must be conservative to avoid false positives like "my head is killing me"
  /kill myself/i,
  /want to die/i,
  /end it all/i,
  /better off dead/i,
  /commit suicide/i,
  /no reason to live/i
];

export const READING_BANDS = {
  blood_pressure: {
    systolic_high: 180,
    diastolic_high: 110,
    // note: plausible limits to ignore bad inputs
    systolic_implausible_high: 300,
    diastolic_implausible_high: 200,
    systolic_implausible_low: 40,
    diastolic_implausible_low: 30,
  },
  oxygen: {
    low: 88,
    implausible_low: 50,
  },
  temperature: {
    high: 102, // F
    implausible_high: 110,
    implausible_low: 90,
  },
  heart_rate: {
    low: 50,
    high: 120,
    implausible_high: 300,
    implausible_low: 20,
  }
};
