import { generateGoaliePatientReply } from './ai/ai';
import { buildGoalieContext, PatientProfile, GoalieChatTurn } from './response-level/prompt-builder';
import { checkInAskInstruction, CHECK_IN_TOPICS, checkInCompleteReply, topicAt } from './state-level/goalie-checkin';
import { assessPatientTone, deriveReadiness } from './state-level/goalie-classifier';

export interface ChatSession {
  patient: PatientProfile;
  turns: GoalieChatTurn[];
  checkInStep: number;
  checkInSkipCount: number;
  coveredTopics: string[];
  isComplete: boolean;
  lastAssistantText: string;
}

const sessions: Record<string, ChatSession> = {};

export async function handleChatMessage(sessionId: string, message: string): Promise<string> {
  let session = sessions[sessionId];

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.isComplete) {
    return checkInCompleteReply();
  }

  const currentTopic = topicAt(session.checkInStep);
  const classifier = await assessPatientTone(message, {
    priorSentiment: 'neutral',
    currentTopicId: currentTopic?.id,
    lastNurseMessage: session.lastAssistantText
  });

  const isEmergency = classifier.flow === 'emergency';
  const isWrapUp = classifier.flow === 'wrap_up';

  if (isWrapUp || isEmergency) {
    session.isComplete = true;
    if (isEmergency) {
      return "If this is a medical emergency, please dial 911 or visit the nearest emergency room immediately. I am notifying your Care Manager.";
    }
  }

  const isSkip = classifier.flow === 'skip';
  if (isSkip) {
    session.checkInSkipCount++;
    if (session.checkInSkipCount >= 3) {
      session.isComplete = true;
      return "Understood — we'll leave the rest for next time. This month's check-in is done. We'll be in touch next month.";
    }
  }

  const readyForQuestions = deriveReadiness(classifier, false);
  if (readyForQuestions && !isSkip) {
    if (currentTopic) {
      session.coveredTopics.push(currentTopic.id);
    }
    session.checkInStep++;
    if (session.checkInStep >= CHECK_IN_TOPICS.length) {
      session.isComplete = true;
      return checkInCompleteReply();
    }
  }

  const newTopic = topicAt(session.checkInStep) || CHECK_IN_TOPICS[0];

  const shouldHoldScript = !readyForQuestions || 
    classifier.sentiment === 'distressed' || 
    classifier.sentiment === 'frustrated' || 
    classifier.sentiment === 'low_mood' || 
    classifier.askedHowAreYou || 
    classifier.flow === 'unclear' || 
    classifier.askedAboutChart;

  const instruction = checkInAskInstruction({
    topic: newTopic,
    hold: shouldHoldScript,
    isRpm: true,
    coveredIds: session.coveredTopics
  });

  const systemPrompt = buildGoalieContext({
    patient: session.patient,
    turnControls: {
      useAddressThisTurn: session.turns.length === 0,
      followupsRemaining: 0,
      canOfferCareManager: false,
      bannedOpeners: [],
      checkInInstruction: instruction
    }
  });
  const reply = await generateGoaliePatientReply(systemPrompt, message, 1000, session.turns);

  session.turns.push({ role: 'user', content: message });
  session.turns.push({ role: 'assistant', content: reply });
  session.lastAssistantText = reply;

  return reply;
}

export function createSession(sessionId: string, patient: PatientProfile) {
  sessions[sessionId] = {
    patient,
    turns: [],
    checkInStep: 0,
    checkInSkipCount: 0,
    coveredTopics: [],
    isComplete: false,
    lastAssistantText: ''
  };
}
