import { generateGoaliePatientReply } from './ai/ai';
import { buildGoalieContext, PatientProfile, GoalieChatTurn } from './response-level/prompt-builder';
import { assessPatientTone } from './state-level/goalie-classifier';
import { 
  StateMachineData, 
  createInitialState, 
  computeTurnControls, 
  transition, 
  buildDirectiveInstruction
} from './state-level/goalie-state-machine';

export interface ChatSession {
  patient: PatientProfile;
  turns: GoalieChatTurn[];
  stateMachine: StateMachineData;
  isComplete: boolean;
  lastAssistantText: string;
}

const sessions: Record<string, ChatSession> = {};

export async function handleChatMessage(sessionId: string, message: string, messageId: string = Math.random().toString()): Promise<string> {
  let session = sessions[sessionId];

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.isComplete) {
    return "This month's check-in is already complete. We'll reach out next month. If something urgent comes up, contact your Care Manager.";
  }

  const currentTopicId = session.stateMachine.topicOrder[session.stateMachine.currentTopicIndex];
  const classifier = await assessPatientTone(message, {
    priorSentiment: session.stateMachine.priorSentiment,
    currentTopicId: currentTopicId,
    lastNurseMessage: session.lastAssistantText
  });

  const isRpm = session.patient.programs?.toLowerCase().includes('rpm') || false;

  const { nextState, directive, sideEffects } = transition(
    session.stateMachine, 
    classifier, 
    { isRpm, messageId }
  );

  session.stateMachine = nextState;

  if (nextState.state === 'OPTED_OUT' || nextState.state === 'CLOSED' || nextState.state === 'HANDOFF') {
    session.isComplete = true;
  }

  const instruction = buildDirectiveInstruction(directive, nextState);
  const turnControls = computeTurnControls(nextState);

  let reply = "";

  if (directive === 'emergency') {
    reply = "If this is a medical emergency, please dial 911 or visit the nearest emergency room immediately. I am notifying your Care Manager.";
  } else if (directive === 'not_the_patient') {
    reply = "Thank you for letting me know. For privacy reasons, I'll pause our check-in here and ask the Care Manager to follow up.";
  } else if (directive === 'reschedule') {
    reply = "No problem. I will have your Care Manager reach out so we can find a better time.";
  } else {
    const systemPrompt = buildGoalieContext({
      patient: session.patient,
      turnControls: {
        useAddressThisTurn: turnControls.useAddressThisTurn,
        followupsRemaining: turnControls.followupsRemaining,
        canOfferCareManager: turnControls.canOfferCareManager,
        bannedOpeners: turnControls.bannedOpeners,
        checkInInstruction: instruction
      }
    });
    reply = await generateGoaliePatientReply(systemPrompt, message, 1000, session.turns);
  }

  session.turns.push({ role: 'user', content: message });
  session.turns.push({ role: 'assistant', content: reply });
  session.lastAssistantText = reply;

  if (turnControls.useAddressThisTurn) {
    session.stateMachine.lastHonorificTurnIndex = session.stateMachine.turnIndex;
  }

  return reply;
}

export function createSession(sessionId: string, patient: PatientProfile) {
  sessions[sessionId] = {
    patient,
    turns: [],
    stateMachine: createInitialState('m1'),
    isComplete: false,
    lastAssistantText: ''
  };
}
