# Goalie Check-in Pipeline v2

This document describes the updated architecture of the Goalie check-in pipeline, establishing the contract boundaries between components.

## 1. Classifier Contract (`goalie-classifier.ts`)
The Classifier is responsible for parsing the patient's incoming message into a structured state object (`ClassifierResult`).

- **Input:** Single user message, wrapped in `<patient_message>` tags to prevent prompt injection.
- **Backstops:** Before invoking the model, exact keyword matching catches carrier opt-outs (STOP, QUIT, etc.) and self-harm phrases, intercepting the message deterministically.
- **Output guarantees:** The module guarantees returning a strictly-typed `ClassifierResult`. It uses OpenAI JSON Mode. On failure, it retries once, then returns a safe default.
- **Normalization:** `normalizeClassification` resolves contradictions (e.g. `flow = emergency` overrides `urgent = true` since emergency is higher precedence).
- **Readiness Derivation:** `deriveReadiness` mathematically determines if the patient is ready for the next question, removing this burden from the LLM.

## 2. State Machine (`goalie-state-machine.ts`)
The core driver of the conversation flow.

- **State:** Fully explicit `StateMachineData` persisting current topic, skipped/credited topics, follow-up counts, and conversation metadata.
- **Transition Function:** A pure function `transition(state, classification, ctx)` that returns the `nextState`, an explicit `directive`, and a list of `sideEffects` (alerts).
- **Idempotency:** Re-processing the same message ID will yield the exact same state without advancing.
- **Turn Controls:** `computeTurnControls` defines strictly when to use the patient's honorific (debounced 4 turns), followups remaining, and banned openers.

## 3. Reply Validator (`reply-validator.ts`)
A strict boundary between the generative Nurse LLM and the outgoing SMS.

- **Checks:** Rejects any reply containing markdown (except safe punctuation), apologies, admissions of being an AI, or length violations (<10 chars or >600 chars).
- **Fallbacks:** No retry loops are permitted. If validation fails, the validator substitutes a deterministic, clinician-approved fallback phrase based on the active `directive`.

## 4. Time Controls & Summaries
- **Time Controls (`time-controls.ts`):** Pure functions defining when to debounce burst messages (2 min), send silence reminders (24 hrs), expire distress pauses (2 hrs), or close inactive check-ins (7 days).
- **Month Summary (`month-summary.ts`):** A pure function that renders the `creditedSet`, `skippedSet`, and remaining topics into a clinical summary record.
