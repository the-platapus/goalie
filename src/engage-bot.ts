import { generateGoaliePatientReply } from './ai/ai';
import { buildGoalieContext, PatientProfile, GoalieChatTurn } from './response-level/prompt-builder';
import { checkInAskInstruction, CHECK_IN_TOPICS, checkInCompleteReply, topicAt, firstUnansweredIndex, mergeCheckInCovered } from './state-level/goalie-checkin';
import { assessPatientTone, ClassifierResult, deriveReadiness } from './state-level/goalie-classifier';

export interface ChatSession {
  patient: PatientProfile;
  turns: GoalieChatTurn[];
  checkInStep: number;
  checkInSkipCount: number;
  coveredTopics: string[];
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
  emergency?: boolean;
  classifierResult?: ClassifierResult;
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
      checkInStep: 0,
      checkInSkipCount: 0,
      coveredTopics: [],
      isComplete: false,
      lastAssistantText: ''
    };
    await this.store.saveSession(sessionId, session);
    return session;
  }

  async getSession(sessionId: string): Promise<ChatSession | undefined> {
    return await this.store.getSession(sessionId);
  }

  async handleChatMessage(sessionId: string, message: string): Promise<BotResponse> {
    const session = await this.store.getSession(sessionId);

    if (!session) {
      throw new Error('Session not found');
    }

    if (session.isComplete) {
      return { 
        reply: checkInCompleteReply(), 
        isComplete: true,
        debugState: { step: session.checkInStep, covered: session.coveredTopics }
      };
    }

    const currentTopic = topicAt(session.checkInStep);
    const classifier = await assessPatientTone(message, {
      priorSentiment: 'neutral', // In a full implementation, track this in session
      currentTopicId: currentTopic?.id,
      lastNurseMessage: session.lastAssistantText
    });

    const isEmergency = classifier.flow === 'emergency';
    const isWrapUp = classifier.flow === 'wrap_up';

    if (isWrapUp || isEmergency) {
      session.isComplete = true;
      let replyText = "Thank you for the update. Let's wrap up our check-in here.";
      if (isEmergency) {
        replyText = "If this is a medical emergency, please dial 911 or visit the nearest emergency room immediately. I am notifying your Care Manager.";
      }
      await this.store.saveSession(sessionId, session);
      return { 
        reply: replyText, 
        isComplete: true, 
        emergency: isEmergency,
        classifierResult: classifier,
        debugState: { step: session.checkInStep, covered: session.coveredTopics }
      };
    }

    // 1. Credit any topics the tone classifier explicitly caught in the patient's message
    session.coveredTopics = mergeCheckInCovered(session.coveredTopics, classifier.creditedTopics || [], true);

    const isSkip = classifier.flow === 'skip';
    if (isSkip) {
      session.checkInSkipCount++;
      // If the patient skips the current question, we must mark it as covered so we don't re-ask it
      if (currentTopic) {
        session.coveredTopics = mergeCheckInCovered(session.coveredTopics, [currentTopic.id], true);
      }
      
      if (session.checkInSkipCount >= 3) {
        session.isComplete = true;
        const replyText = "Understood — we'll leave the rest for next time. This month's check-in is done. We'll be in touch next month.";
        await this.store.saveSession(sessionId, session);
        return { 
          reply: replyText, 
          isComplete: true,
          classifierResult: classifier,
          debugState: { step: session.checkInStep, covered: session.coveredTopics }
        };
      }
    }

    // 2. If the tone classifier says they are ready for the next question, mark the current topic as covered
    const readyForQuestions = deriveReadiness(classifier, false); // For now false, Phase 3 will track exhaustions
    if (readyForQuestions && currentTopic) {
      session.coveredTopics = mergeCheckInCovered(session.coveredTopics, [currentTopic.id], true);
    }

    // 3. Recalculate the true step index based on ALL covered topics
    session.checkInStep = firstUnansweredIndex(session.coveredTopics, true, true);

    if (session.checkInStep >= CHECK_IN_TOPICS.length) {
      session.isComplete = true;
      await this.store.saveSession(sessionId, session);
      return { 
        reply: checkInCompleteReply(), 
        isComplete: true,
        classifierResult: classifier,
        debugState: { step: session.checkInStep, covered: session.coveredTopics }
      };
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
      gentle: classifier.sentiment === 'distressed',
      vent: classifier.sentiment === 'frustrated',
      mood: classifier.sentiment === 'low_mood',
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

    await this.store.saveSession(sessionId, session);

    return { 
      reply, 
      isComplete: session.isComplete,
      classifierResult: classifier,
      debugState: { 
        step: session.checkInStep, 
        currentTopic: newTopic.id,
        covered: session.coveredTopics,
        skipCount: session.checkInSkipCount,
        instruction: instruction
      }
    };
  }
}
