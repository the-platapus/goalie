# Goalie - Medical Check-in Bot

A sophisticated, highly realistic medical check-in chatbot built for patient care coordination (e.g., Chronic Care Management, Remote Patient Monitoring). 

## Multi-Level Architecture

To achieve a conversational flow that feels authentically human while strictly adhering to a medical questionnaire and safeguarding against emergencies, this bot employs a **Two-Layer AI Architecture**. 

Instead of trusting a single LLM prompt to simultaneously be warm, read a medical chart, track questionnaire progress, and handle emergencies, the workload is split into two distinct models orchestrated by a deterministic state machine.

### 1. The State Bot (Tone & Intent Classification)
* **Location:** `src/state-level/`
* **Role:** Analytical and non-conversational.
* **How it works:** 
  The patient's raw message is first sent to the State Bot, which evaluates the text against the current context (prior tone, current topic, last nurse message). It returns a strict **JSON object** (`ToneAssessment`) classifying the patient's intent.
* **Key Responsibilities:**
  - **Emergency Detection:** Detects acute medical situations (e.g., chest pain, suicidal thoughts) to trigger immediate handoffs.
  - **Flow Control:** Identifies if a patient is skipping a question, wrapping up the check-in entirely, or ready to advance to the next topic.
  - **Checklist Credit:** Extracts which topics the patient naturally answered (e.g., mentioning they took their meds while answering how they feel) so the bot doesn't re-ask them later.
  - **Tone Detection:** Classifies the patient's emotional state (calm, distressed, frustrated) to pause the medical script and offer empathy when needed.

### 2. The Orchestrator (Deterministic State Machine)
* **Location:** `src/chatbot-service.ts` & `src/state-level/goalie-checkin.ts`
* **Role:** The glue between the State Bot and Response Bot.
* **How it works:** 
  Based on the JSON output from the State Bot, the orchestrator updates the session state in memory. 
  - If the patient is distressed, it "holds" the script.
  - If the patient answers successfully, it advances the `checkInStep`.
  - It then retrieves the exact instruction for the *current* state (e.g., "Ask whether they have gotten their labs done").

### 3. The Response Bot (Conversational Nurse)
* **Location:** `src/response-level/` & `src/ai/ai.ts`
* **Role:** Generative, empathetic, and grounded natural language generation.
* **How it works:** 
  The Response Bot takes the strict instruction provided by the Orchestrator and combines it with a massive, dynamic system prompt (`default-knowledge-base.ts`) that is heavily populated with the patient's exact medical chart (conditions, medications, vitals, care plan, etc.).
* **Key Responsibilities:**
  - **Persona:** Acts as a warm, respectful care assistant nurse.
  - **Grounding:** Uses the injected Patient Profile as absolute ground truth, answering patient questions about their own chart accurately.
  - **Focus:** Generates exactly one response based on the current step, entirely relieved of the burden of tracking the overall check-in progress.

## Why this Architecture?
By separating **decision-making** (State Bot) from **language generation** (Response Bot), the system prevents common LLM pitfalls:
- **No Hallucinated Progress:** The generative model cannot arbitrarily decide the check-in is over; only the deterministic orchestrator can advance the script.
- **Safety First:** Emergencies are caught by analytical JSON classification rather than hoping a chatty persona remembers to flag them.
- **Medical Accuracy:** The generative model only focuses on phrasing the current medical context correctly, rather than trying to balance script progression with empathy.
