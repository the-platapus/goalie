import { generateGoaliePatientReply } from './ai/ai';
import { buildGoalieContext, PatientProfile, GoalieChatTurn } from './response-level/prompt-builder';
import { assessPatientTone } from './state-level/goalie-classifier';
import { validateNurseReply } from './response-level/reply-validator';
import { sendCareManagerAlert } from './state-level/escalations';
import { appendAuditRecord } from './state-level/audit';
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

export const sessions: Record<string, ChatSession> = {};

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

  // Fire side effects
  for (const effect of sideEffects) {
    if (effect.alertToCareManager) {
      await sendCareManagerAlert(
        sessionId,
        sessionId,
        effect.alertToCareManager,
        effect.alertReason || 'No reason provided'
      );
    }
  }

  const instruction = buildDirectiveInstruction(directive, nextState);
  const turnControls = computeTurnControls(nextState);

  let reply = "";
  let systemPrompt = "";
  let valResult: { valid: boolean; reason?: string; reply: string } = { valid: true, reply: reply };

  if (directive === 'emergency') {
    reply = "If this is a medical emergency, please dial 911 or visit the nearest emergency room immediately. I am notifying your Care Manager.";
  } else if (directive === 'not_the_patient') {
    reply = "Thank you for letting me know. For privacy reasons, I'll pause our check-in here and ask the Care Manager to follow up.";
  } else if (directive === 'reschedule') {
    reply = "No problem. I will have your Care Manager reach out so we can find a better time.";
  } else if (nextState.state === 'OPTED_OUT') {
    reply = "You have been unsubscribed and will not receive further messages.";
  } else if (directive === 'help') {
    reply = "This is the automated assistant for your Care Manager. Reply STOP to cancel or START to resubscribe.";
  } else if (directive === 'subscribe') {
    reply = "You have been resubscribed.";
  } else if (directive === 'self_harm') {
    reply = "If you are in immediate danger, please dial 911. You can also call or text 988 to reach the Suicide & Crisis Lifeline. I am notifying your Care Manager.";
  } else {
    systemPrompt = buildGoalieContext({
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
    valResult = validateNurseReply(reply, { directive });
    if (!valResult.valid) {
      console.warn(`[goalie] Reply validation failed (${valResult.reason}): ${reply}`);
    }
    reply = valResult.reply;
  }

  await appendAuditRecord({
    sessionId,
    patientMessage: message,
    classifierJSON: classifier,
    decisionLog: {
      priorState: JSON.parse(JSON.stringify(session.stateMachine)),
      transitionContext: { isRpm, messageId },
      nextState,
      directive,
      sideEffects
    },
    nursePrompt: typeof systemPrompt !== 'undefined' ? systemPrompt : '',
    nurseRawResponse: reply,
    validationResult: typeof valResult !== 'undefined' ? valResult : { valid: true },
    finalReply: reply
  });

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
