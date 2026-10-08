import { generateGoaliePatientReply } from './ai/ai';
import { buildGoalieContext, PatientProfile, GoalieChatTurn } from './response-level/prompt-builder';
import { generateHardcodedGreeting } from './state-level/goalie-checkin';
import { assessPatientTone } from './state-level/goalie-classifier';
import { validateNurseReply } from './response-level/reply-validator';
import { 
  StateMachineData, 
  createInitialState, 
  computeTurnControls, 
  transition, 
  buildDirectiveInstruction,
  DirectiveType
} from './state-level/goalie-state-machine';

export interface ChatSession {
  patient: PatientProfile;
  turns: GoalieChatTurn[];
  stateMachine: StateMachineData;
  isComplete: boolean;
  lastAssistantText: string;
}

export interface SessionStore {
  getSession(sessionId: string): Promise<ChatSession | undefined> | ChatSession | undefined;
  saveSession(sessionId: string, session: ChatSession): Promise<void> | void;
}

export class InMemorySessionStore implements SessionStore {
  private sessions: Record<string, ChatSession> = {};
  
  getSession(sessionId: string): ChatSession | undefined {
    return this.sessions[sessionId];
  }
  
  saveSession(sessionId: string, session: ChatSession): void {
    this.sessions[sessionId] = session;
  }
}

export interface BotResponse {
  reply: string;
  isComplete: boolean;
  debugState?: any;
}

export class EngageBot {
  private store: SessionStore;

  constructor(store?: SessionStore) {
    this.store = store || new InMemorySessionStore();
  }

  async createSession(sessionId: string, patient: PatientProfile): Promise<ChatSession> {
    const session: ChatSession = {
      patient,
      turns: [],
      stateMachine: createInitialState('m1'),
      isComplete: false,
      lastAssistantText: ''
    };
    await this.store.saveSession(sessionId, session);
    return session;
  }

  async getSession(sessionId: string): Promise<ChatSession | undefined> {
    return await this.store.getSession(sessionId);
  }

  async handleChatMessage(sessionId: string, message: string, messageId: string = Math.random().toString()): Promise<BotResponse> {
    const session = await this.store.getSession(sessionId);

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.isComplete) {
      return { 
        reply: "This month's check-in is already complete. We'll reach out next month. If something urgent comes up, contact your Care Manager.", 
        isComplete: true
      };
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

    // Fire side effects (mocked)
    for (const effect of sideEffects) {
      if (effect.alertToCareManager) {
        console.log(`[ALERT] ${effect.alertToCareManager}: ${effect.alertReason}`);
      }
    }

    // Build instruction and generate reply
    const instruction = buildDirectiveInstruction(directive, nextState);
    const turnControls = computeTurnControls(nextState);

    let reply = "";

    // Hardcode fallback replies for certain directives to prevent LLM hallucination on safety boundaries
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
      const valResult = validateNurseReply(reply, { directive });
      if (!valResult.valid) {
        console.warn(`[goalie] Reply validation failed (${valResult.reason}): ${reply}`);
      }
      reply = valResult.reply;
    }

    session.turns.push({ role: 'user', content: message });
    session.turns.push({ role: 'assistant', content: reply });
    session.lastAssistantText = reply;

    if (turnControls.useAddressThisTurn) {
      session.stateMachine.lastHonorificTurnIndex = session.stateMachine.turnIndex;
    }

    await this.store.saveSession(sessionId, session);

    return { 
      reply, 
      isComplete: session.isComplete,
      debugState: { 
        state: nextState.state,
        directive,
        sideEffects
      }
    };
  }
}
