import { StateMachineData } from './goalie-state-machine';

export function buildClinicalSummary(state: StateMachineData): string {
  const covered = state.creditedSet.join(', ') || 'None';
  const skipped = state.skippedSet.join(', ') || 'None';
  
  // Find remaining unasked topics
  const remainingSet = state.topicOrder.filter(
    id => !state.creditedSet.includes(id) && !state.skippedSet.includes(id)
  );
  
  const remaining = remainingSet.join(', ') || 'None';
  
  const closureStatus = state.state === 'CLOSED' || state.state === 'OPTED_OUT' 
    ? `Check-in closed (${state.state}).` 
    : `Check-in active (${state.state}).`;
    
  return `${closureStatus}\nTopics covered: ${covered}\nTopics skipped: ${skipped}\nRemaining topics: ${remaining}`;
}
