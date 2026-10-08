import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-mock',
});

export async function createChatCompletion(params: any): Promise<any> {
  try {
    const response = await openai.chat.completions.create(params);
    return response;
  } catch (error) {
    console.error('OpenAI Error:', error);
    throw error;
  }
}

export function extractJsonObject(text: string): { ok: boolean; value?: any } {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return { ok: true, value: JSON.parse(match[0]) };
    }
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    console.error('Failed to parse JSON', text);
    return { ok: false };
  }
}

export function getOpenAIModel(): string {
  return 'gpt-4o'; // Use gpt-4o for everything in this express app
}

export function usesCompletionTokensApi(model: string): boolean {
  return false;
}

export function chatCompletionLimitParams(model: string, max_tokens: number, temperature: number, reasoning_effort?: string): any {
  return { max_tokens, temperature };
}

export function getGoaliePatientOpenAIModel(): string {
  return 'gpt-4o';
}
