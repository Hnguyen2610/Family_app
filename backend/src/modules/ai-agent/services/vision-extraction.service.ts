import { BadRequestException, Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { PrismaService } from '../../../prisma/prisma.service';

type VisionDraftKind = 'auto' | 'receipt' | 'medicine' | 'school_plan';

type CreateVisionDraftInput = {
  familyId: string;
  userId?: string;
  image?: string;
  imageUrl?: string;
  kind?: VisionDraftKind;
  note?: string;
};

type DraftStatus = 'DRAFT' | 'CONFIRMED' | 'DISMISSED';

@Injectable()
export class VisionExtractionService {
  private readonly gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  private readonly groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY || 'missing', baseURL: 'https://api.groq.com/openai/v1' });
  private readonly groqModelName = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
  private readonly geminiModelName = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  private readonly preferredProvider = process.env.AI_VISION_PROVIDER || 'groq';

  constructor(private readonly prisma: PrismaService) {}

  async createVisionDraft(input: CreateVisionDraftInput) {
    if (!input.familyId) throw new BadRequestException('familyId is required');
    if (!input.image && !input.imageUrl) throw new BadRequestException('image or imageUrl is required');

    const structured = await this.extractStructuredData(input, input.kind || 'auto', input.note);
    const provider = structured.__provider || this.preferredProvider;
    delete structured.__provider;

    return this.prisma.aiExtractionDraft.create({
      data: {
        familyId: input.familyId,
        userId: input.userId,
        draftType: structured.draftType || input.kind || 'unknown',
        status: 'DRAFT',
        sourceType: 'image',
        summary: structured.summary,
        rawText: structured.rawText,
        structuredData: structured,
        metadata: {
          provider,
          model: provider === 'groq' ? this.groqModelName : this.geminiModelName,
          requestedKind: input.kind || 'auto',
          confidence: structured.confidence,
          imageSource: input.imageUrl ? 'url' : 'base64',
        },
      },
    });
  }

  async listVisionDrafts(familyId: string, status?: string) {
    return this.prisma.aiExtractionDraft.findMany({
      where: {
        familyId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async updateDraftStatus(familyId: string, draftId: string, status: DraftStatus) {
    return this.prisma.aiExtractionDraft.updateMany({
      where: { id: draftId, familyId },
      data: { status },
    });
  }

  private parseImage(image: string) {
    const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
    if (!match) throw new BadRequestException('image must be a data URL');

    return {
      inlineData: {
        mimeType: match[1],
        data: match[2].replace(/\s/g, ''),
      },
    };
  }

  private async extractStructuredData(input: CreateVisionDraftInput, kind: VisionDraftKind, note?: string) {
    const prompt = this.buildExtractionPrompt(kind, note);

    if (this.preferredProvider !== 'gemini' && process.env.GROQ_API_KEY) {
      try {
        const structured = await this.extractWithGroq(input.imageUrl || input.image, prompt);
        return { ...structured, __provider: 'groq' };
      } catch (error) {
        if (!process.env.GEMINI_API_KEY) throw error;
      }
    }

    const imagePart = input.image ? this.parseImage(input.image) : await this.fetchImageAsGeminiPart(input.imageUrl || '');
    const structured = await this.extractWithGemini(imagePart, prompt);
    return { ...structured, __provider: 'gemini' };
  }

  private async extractWithGroq(imageUrl: string | undefined, prompt: string) {
    if (!imageUrl) throw new BadRequestException('imageUrl or base64 image is required for Groq vision');

    const completion = await this.groq.chat.completions.create({
      model: this.groqModelName,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 900,
      response_format: { type: 'json_object' },
    });

    return this.parseJson(completion.choices[0]?.message?.content || '{}');
  }

  private async extractWithGemini(imagePart: any, prompt: string) {
    const model = this.gemini.getGenerativeModel({
      model: this.geminiModelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0,
        maxOutputTokens: 900,
      },
    });

    const result = await model.generateContent([{ text: prompt }, imagePart]);
    const text = result.response.text();
    return this.parseJson(text);
  }

  private buildExtractionPrompt(kind: VisionDraftKind, note?: string) {
    return `You are a high-precision family data extractor. Extract only action-ready data from this image.
Support Vietnamese language in all text fields. Return compact JSON only.

Kind: ${kind}. Note: ${note || 'none'}.

RULES:
- draftType: If it's a receipt/invoice, use "receipt". If medical/prescription, use "medicine". If schedule/school notice, use "school_plan". Otherwise "unknown".
- summary: Create a very short, meaningful title (e.g., "Hóa đơn Circle K", "Đơn thuốc Bé An").
- confidence: Score from 0.0 to 1.0.
- transactionDraft: Required for receipts. Ensure 'amount' is a number without commas. 'type' must be INCOME or EXPENSE.
- eventDrafts: Extract specific appointments or recurring school tasks.
- medicineDraft: Extract patient name and full schedule if available.

{
  "draftType": "receipt | medicine | school_plan | unknown",
  "summary": "short summary in Vietnamese",
  "rawText": "important OCR text (max 500 chars)",
  "confidence": 0.0,
  "transactionDraft": null | {
    "amount": 0,
    "type": "INCOME | EXPENSE",
    "category": "FOOD | TRANSPORT | SHOPPING | UTILITIES | RENT | ENTERTAINMENT | HEALTH | EDUCATION | OTHER",
    "description": "short description",
    "date": "YYYY-MM-DD"
  },
  "eventDrafts": [
    {
      "title": "event title",
      "date": "YYYY-MM-DD",
      "time": "HH:mm",
      "type": "APPOINTMENT | TASK | GENERAL",
      "description": "short description"
    }
  ],
  "medicineDraft": null | {
    "patient": "name",
    "medicines": [{"name": "medicine", "dosage": "dose", "schedule": "usage", "notes": "notes"}],
    "warnings": ["safety notes"]
  },
  "warnings": ["missing or uncertain fields"]
}`;
  }

  private async fetchImageAsGeminiPart(imageUrl: string) {
    if (!imageUrl) throw new BadRequestException('imageUrl is required');
    const response = await fetch(imageUrl);
    if (!response.ok) throw new BadRequestException('Unable to fetch imageUrl for Gemini fallback');
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();

    return {
      inlineData: {
        mimeType: contentType,
        data: Buffer.from(arrayBuffer).toString('base64'),
      },
    };
  }

  private parseJson(text: string) {
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new BadRequestException('Vision model did not return valid JSON');
      return JSON.parse(match[0]);
    }
  }
}
