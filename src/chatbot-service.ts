import { generateEngagePatientReply } from './ai/ai';
import { buildEngageContext, PatientProfile, EngageChatTurn } from './response-level/prompt-builder';
import { checkInAskInstruction, CHECK_IN_TOPICS, checkInCompleteReply, topicAt } from './state-level/engage-checkin';
import { assessPatientTone, ToneAssessment, shouldHoldScript } from './state-level/engage-tone';

export interface ChatSession {
  patient: PatientProfile;
  turns: EngageChatTurn[];
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
  const tone = await assessPatientTone(message, {
    priorTone: 'calm',
    currentTopicId: currentTopic?.id,
    lastAssistantText: session.lastAssistantText
  });

  if (tone.wrapUpCheckIn || tone.emergency) {
    session.isComplete = true;
    if (tone.emergency) {
      return "If this is a medical emergency, please dial 911 or visit the nearest emergency room immediately. I am notifying your Care Manager.";
    }
  }

  if (tone.skipQuestion) {
    session.checkInSkipCount++;
    if (session.checkInSkipCount >= 3) {
      session.isComplete = true;
      return "Understood — we'll leave the rest for next time. This month's check-in is done. We'll be in touch next month.";
    }
  }

  if (tone.readyForQuestions && !tone.skipQuestion) {
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

  const instruction = checkInAskInstruction({
    topic: newTopic,
    hold: shouldHoldScript(tone),
    isRpm: true,
    coveredIds: session.coveredTopics
  });

  const systemPrompt = buildEngageContext(session.patient, instruction, 0, '');
  const reply = await generateEngagePatientReply(systemPrompt, message, 1000, session.turns);

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
