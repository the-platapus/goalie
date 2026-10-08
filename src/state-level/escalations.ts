export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AlertCategory = 'emergency' | 'self_harm' | 'urgent' | 'not_the_patient' | 'opt_out' | 'reading_band';

export interface AlertDefinition {
  category: AlertCategory;
  severity: AlertSeverity;
  description: string;
  requiresImmediateAction: boolean;
}

export const ALERT_DEFINITIONS: Record<AlertCategory, AlertDefinition> = {
  emergency: {
    category: 'emergency',
    severity: 'critical',
    description: 'Patient reported a medical emergency',
    requiresImmediateAction: true
  },
  self_harm: {
    category: 'self_harm',
    severity: 'critical',
    description: 'Patient used language indicating potential self harm',
    requiresImmediateAction: true
  },
  urgent: {
    category: 'urgent',
    severity: 'high',
    description: 'Patient reported an urgent issue or symptom',
    requiresImmediateAction: true
  },
  reading_band: {
    category: 'reading_band',
    severity: 'high',
    description: 'Patient reported a clinical reading outside of safe bands',
    requiresImmediateAction: true
  },
  not_the_patient: {
    category: 'not_the_patient',
    severity: 'medium',
    description: 'Someone other than the patient is responding',
    requiresImmediateAction: false
  },
  opt_out: {
    category: 'opt_out',
    severity: 'low',
    description: 'Patient opted out of the service',
    requiresImmediateAction: false
  }
};

export interface OutboxAlert {
  id: string;
  patientId: string;
  sessionId: string;
  alert: AlertDefinition;
  reason: string;
  createdAt: string;
  status: 'pending' | 'delivered' | 'failed';
}

const mockAlertOutbox: OutboxAlert[] = [];

export async function sendCareManagerAlert(
  patientId: string, 
  sessionId: string, 
  category: AlertCategory, 
  reason: string
): Promise<OutboxAlert> {
  const definition = ALERT_DEFINITIONS[category];
  
  const alert: OutboxAlert = {
    id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    patientId,
    sessionId,
    alert: definition,
    reason,
    createdAt: new Date().toISOString(),
    status: 'pending' // Simulated
  };
  
  mockAlertOutbox.push(alert);
  console.log(`[OUTBOX] Alert queued for ${patientId}: [${category}] ${reason}`);
  
  // Simulated delivery
  setTimeout(() => {
    alert.status = 'delivered';
  }, 1000);

  return alert;
}

export function getPendingAlerts(): OutboxAlert[] {
  return mockAlertOutbox.filter(a => a.status === 'pending');
}
