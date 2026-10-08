import { ClassifierResult } from './goalie-classifier';
import { StateMachineData, TransitionResult } from './goalie-state-machine';

export interface AuditRecord {
  id: string;
  sessionId: string;
  timestamp: string;
  patientMessage: string;
  classifierJSON: ClassifierResult;
  decisionLog: {
    priorState: StateMachineData;
    transitionContext: any;
    nextState: StateMachineData;
    directive: string;
    sideEffects: any[];
  };
  nursePrompt: string;
  nurseRawResponse: string;
  validationResult?: {
    valid: boolean;
    reason?: string;
  };
  finalReply: string;
}

const mockAuditLog: AuditRecord[] = [];

export async function appendAuditRecord(record: Omit<AuditRecord, 'id' | 'timestamp'>): Promise<void> {
  const fullRecord: AuditRecord = {
    ...record,
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date().toISOString()
  };
  
  mockAuditLog.push(fullRecord);
  
  // In a real system, this would write to a secure, HIPAA-compliant datastore
  // For PHI safety, we do NOT console.log patientMessage or prompts here
  console.log(`[AUDIT] Record created for session ${record.sessionId}. State: ${record.decisionLog.nextState.state}, Directive: ${record.decisionLog.directive}`);
}

export function getAuditLogsForSession(sessionId: string): AuditRecord[] {
  return mockAuditLog.filter(a => a.sessionId === sessionId);
}
