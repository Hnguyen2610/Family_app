import { Injectable } from '@nestjs/common';
import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AiModelClientsService {
  readonly openai: OpenAI;
  readonly gemini: GoogleGenerativeAI;
  readonly groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  readonly geminiModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });
    this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  }
}
