import { ClassifierResult } from './goalie-classifier';
import { CHECK_IN_TOPICS, CheckInTopic, topicById } from './goalie-checkin';

export type StateName = 
  | 'VERIFY_ID' 
  | 'IN_CHECKIN' 
  | 'PENDING_FOLLOWUP' 
  | 'DISTRESS_PAUSE' 
  | 'AWAITING_ALT_TIME' 
  | 'DEFERRED' 
  | 'HANDOFF' 
  | 'OPTED_OUT' 
  | 'CLOSED';

export interface StateMachineData {
  state: StateName;
  topicOrder: string[];
  currentTopicIndex: number;
  creditedSet: string[];
  skippedSet: string[];
  followUpCounts: Record<string, number>;
  openProblem: string | null;
  careManagerOffered: boolean;
  turnIndex: number;
  lastHonorificTurnIndex: number;
  lastTwoOpeners: string[];
  priorSentiment: string;
  pauseReason: string | null;
  pauseStartTime: number | null;
  rephraseCount: Record<string, number>;
  monthId: string;
  version: number;
  processedInboundMessageIds: string[];
}

export type DirectiveType = 
  | 'topic_ask'
  | 'follow_up'
  | 'rephrase'
  | 'low_mood'
  | 'frustration'
  | 'medication_why'
  | 'alt_time'
  | 'urgent_ack'
  | 'emergency'
  | 'not_the_patient'
  | 'reschedule'
  | 'chart_answer'
  | 'resume_pause'
  | 'closing';

export interface TransitionContext {
  isRpm: boolean;
  messageId: string;
}

export interface TransitionResult {
  nextState: StateMachineData;
  directive: DirectiveType;
  sideEffects: {
    alertToCareManager?: 'emergency' | 'self_harm' | 'urgent' | 'not_the_patient' | 'opt_out' | 'reading_band';
    alertReason?: string;
  }[];
}

export function createInitialState(monthId: string): StateMachineData {
  return {
    state: 'VERIFY_ID', // Start here usually, wait for ID confirmation
    topicOrder: CHECK_IN_TOPICS.map(t => t.id),
    currentTopicIndex: 0,
    creditedSet: [],
    skippedSet: [],
    followUpCounts: {},
    openProblem: null,
    careManagerOffered: false,
    turnIndex: 0,
    lastHonorificTurnIndex: -10, // far in the past
    lastTwoOpeners: [],
    priorSentiment: 'neutral',
    pauseReason: null,
    pauseStartTime: null,
    rephraseCount: {},
    monthId,
    version: 1,
    processedInboundMessageIds: [],
  };
}

export function computeTurnControls(state: StateMachineData) {
  const isOpening = state.turnIndex === 0;
  const turnsSinceHonorific = state.turnIndex - state.lastHonorificTurnIndex;
  
  // yes on opening, else yes if >= 4 turns passed and previous didn't use it (turnsSinceHonorific >= 4 implies previous didn't use it, as that would make it 1)
  const useAddressThisTurn = isOpening ? true : (turnsSinceHonorific >= 4);

  const followupsRemaining = state.openProblem 
    ? Math.max(0, 2 - (state.followUpCounts[state.openProblem] || 0)) 
    : 0;

  const currentTopicId = state.topicOrder[state.currentTopicIndex];
  const canOfferCareManager = !state.careManagerOffered && (currentTopicId === 'diet' || currentTopicId === 'activity');

  const staticBannedOpeners = ["Thank you for telling me", "Thank you for sharing", "Thanks for your response", "Per your record", "Feel free to reach out", "That's wonderful", "Would you mind", "I'm here to help coordinate anything", "all good", "Okay, noted"];
  
  const bannedOpeners = [...staticBannedOpeners, ...state.lastTwoOpeners];

  return {
    useAddressThisTurn,
    followupsRemaining,
    canOfferCareManager,
    bannedOpeners
  };
}

export function transition(
  state: StateMachineData, 
  classification: ClassifierResult, 
  ctx: TransitionContext
): TransitionResult {
  if (state.processedInboundMessageIds.includes(ctx.messageId)) {
    // Idempotency: returning current state with no side effects
    // In a real system, we might replay the last outbound, but we just return state here
    return { nextState: state, directive: 'topic_ask', sideEffects: [] }; // Mock directive
  }

  const nextState = JSON.parse(JSON.stringify(state)) as StateMachineData;
  nextState.version += 1;
  nextState.processedInboundMessageIds.push(ctx.messageId);
  nextState.turnIndex += 1;
  nextState.priorSentiment = classification.sentiment;

  const sideEffects: TransitionResult['sideEffects'] = [];
  
  // 1. Opt-out
  if (classification.specialRequest === 'opt_out') {
    nextState.state = 'OPTED_OUT';
    sideEffects.push({ alertToCareManager: 'opt_out', alertReason: 'Patient opted out' });
    return { nextState, directive: 'closing', sideEffects };
  }

  // 2. Emergency
  if (classification.flow === 'emergency') {
    nextState.state = 'HANDOFF';
    sideEffects.push({ alertToCareManager: 'emergency', alertReason: classification.namedProblem || 'Emergency condition detected' });
    return { nextState, directive: 'emergency', sideEffects };
  }

  // Urgent (doesn't preempt flow completely but triggers alert)
  if (classification.urgent) {
    sideEffects.push({ alertToCareManager: 'urgent', alertReason: classification.namedProblem || 'Urgent condition detected' });
    // We don't change state to HANDOFF for urgent, we just acknowledge it and continue if appropriate
  }

  // Special requests
  if (classification.specialRequest === 'not_the_patient') {
    nextState.state = 'HANDOFF';
    sideEffects.push({ alertToCareManager: 'not_the_patient', alertReason: 'Someone else is responding' });
    return { nextState, directive: 'not_the_patient', sideEffects };
  }

  if (classification.specialRequest === 'reschedule') {
    nextState.state = 'DEFERRED';
    return { nextState, directive: 'reschedule', sideEffects };
  }
  
  // 3. Wrap-up
  if (classification.flow === 'wrap_up') {
    nextState.state = 'CLOSED';
    return { nextState, directive: 'closing', sideEffects };
  }

  // Credit topics
  for (const topic of classification.creditedTopics) {
    if (!nextState.creditedSet.includes(topic)) {
      nextState.creditedSet.push(topic);
    }
  }

  const currentTopicId = nextState.topicOrder[nextState.currentTopicIndex];
  
  // 4. Skip
  if (classification.flow === 'skip') {
    if (currentTopicId && !nextState.skippedSet.includes(currentTopicId)) {
      nextState.skippedSet.push(currentTopicId);
    }
  }

  // Check unclear rephrase logic
  if (classification.flow === 'unclear') {
    const topic = currentTopicId || 'general';
    nextState.rephraseCount[topic] = (nextState.rephraseCount[topic] || 0) + 1;
    if (nextState.rephraseCount[topic] >= 2) {
      // Reached limit, escalate to care manager offer
      return { nextState, directive: 'frustration', sideEffects }; 
    }
    return { nextState, directive: 'rephrase', sideEffects };
  }

  // If distress
  if (classification.sentiment === 'distressed') {
    if (nextState.state !== 'DISTRESS_PAUSE') {
      nextState.state = 'DISTRESS_PAUSE';
      nextState.pauseReason = 'distressed';
      nextState.pauseStartTime = Date.now();
    }
    // Stay in pause, give gentle listening
    return { nextState, directive: 'low_mood', sideEffects };
  }

  // If low mood
  if (classification.sentiment === 'low_mood') {
    return { nextState, directive: 'low_mood', sideEffects };
  }

  // If frustrated
  if (classification.sentiment === 'frustrated') {
    return { nextState, directive: 'frustration', sideEffects };
  }

  // Resume
  if (classification.flow === 'resume') {
    nextState.state = 'IN_CHECKIN';
    nextState.pauseReason = null;
    nextState.pauseStartTime = null;
    return { nextState, directive: 'resume_pause', sideEffects };
  }

  // Named Problem -> Followup
  if (classification.namedProblem && classification.symptomPresent) {
    const prob = classification.namedProblem.toLowerCase();
    nextState.openProblem = prob;
    const follows = nextState.followUpCounts[prob] || 0;
    if (follows < 2) {
      nextState.state = 'PENDING_FOLLOWUP';
      nextState.followUpCounts[prob] = follows + 1;
      return { nextState, directive: 'follow_up', sideEffects };
    } else {
      // exhausted followups, clear open problem and advance
      nextState.openProblem = null;
      if (nextState.state === 'PENDING_FOLLOWUP') {
        nextState.state = 'IN_CHECKIN';
      }
    }
  } else {
    nextState.openProblem = null;
    if (nextState.state === 'PENDING_FOLLOWUP') {
      nextState.state = 'IN_CHECKIN';
    }
  }

  // Medication Why
  if (classification.medicationAnswer === 'negative') {
    return { nextState, directive: 'medication_why', sideEffects };
  }

  // Next Checkin declined
  if (classification.nextCheckinAnswer === 'declined') {
    nextState.state = 'AWAITING_ALT_TIME';
    return { nextState, directive: 'alt_time', sideEffects };
  }
  
  if (classification.nextCheckinAnswer === 'confirmed') {
    nextState.state = 'CLOSED';
    return { nextState, directive: 'closing', sideEffects };
  }

  // Chart Answer
  if (classification.askedQuestion || classification.askedAboutChart || classification.askedForChartSlice) {
    return { nextState, directive: 'chart_answer', sideEffects };
  }

  if (classification.urgent) {
    return { nextState, directive: 'urgent_ack', sideEffects };
  }

  // Advance topic
  let nextTopicIndex = nextState.currentTopicIndex;
  while (nextTopicIndex < nextState.topicOrder.length) {
    const id = nextState.topicOrder[nextTopicIndex];
    if (nextState.creditedSet.includes(id) || nextState.skippedSet.includes(id)) {
      nextTopicIndex++;
      continue;
    }
    if (ctx.isRpm && id === 'readings') {
      nextTopicIndex++;
      continue;
    }
    break;
  }

  if (nextTopicIndex >= nextState.topicOrder.length) {
    nextState.state = 'CLOSED';
    return { nextState, directive: 'closing', sideEffects };
  }

  nextState.currentTopicIndex = nextTopicIndex;
  nextState.state = 'IN_CHECKIN';
  
  return { nextState, directive: 'topic_ask', sideEffects };
}

export function buildDirectiveInstruction(directive: DirectiveType, state: StateMachineData): string {
  const currentTopic = topicById(state.topicOrder[state.currentTopicIndex]);
  const topicLabel = currentTopic ? currentTopic.label : 'this topic';

  switch (directive) {
    case 'topic_ask':
      return `CRITICAL RULE: If the patient asked a question, answer it from the Patient Profile. Otherwise, ask ONE question about ${topicLabel}. Do not start another topic. Do not close the check-in.`;
    case 'follow_up':
      return `The patient mentioned a problem (${state.openProblem}). Acknowledge it briefly, and ask one follow-up question to learn more. Do not ask about other topics yet.`;
    case 'rephrase':
      return `They did not understand your last question. Rephrase your question about ${topicLabel} using simpler words. Do not apologize.`;
    case 'low_mood':
      return `They are feeling down. Give one warm, empathetic line. Offer to connect them with a person on their care team if they want that. Do not dump chart information or change the subject.`;
    case 'frustration':
      return `They are frustrated. Acknowledge their frustration gently. Do not repeat the exact same question they are frustrated with. Ask how they want to proceed.`;
    case 'medication_why':
      return `They said they are not taking their medications. Ask them gently what made them stop or if they are having any issues with them.`;
    case 'alt_time':
      return `They declined the proposed check-in time. Ask them what day and time would work better for them.`;
    case 'urgent_ack':
      return `Acknowledge their symptom or concern. Inform them you will flag this for their Care Manager to review today. Ask if they have anything else to pass along right now.`;
    case 'emergency':
      return `This is a medical emergency. Instruct them to dial 911 or go to the nearest emergency room immediately. Tell them you are notifying their Care Manager.`;
    case 'not_the_patient':
      return `Acknowledge that they are not the patient. Tell them for privacy reasons you will pause the check-in and have the Care Manager follow up.`;
    case 'reschedule':
      return `They want to reschedule or talk later. Tell them you will have their Care Manager reach out to find a better time.`;
    case 'chart_answer':
      return `They asked a question about their care plan or chart. Answer it strictly using the information in the Patient Profile. Do not add your check-in question this turn.`;
    case 'resume_pause':
      return `They are ready to resume the check-in. Acknowledge this, and ask your next question about ${topicLabel}.`;
    case 'closing':
      return `Wrap up the conversation warmly. Tell them that's everything for this month's check-in. Let them know they can reach out to their Care Manager if anything changes.`;
  }
}
