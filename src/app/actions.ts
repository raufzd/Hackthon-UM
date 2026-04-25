"use server";

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

import type { DocumentType, IngredientStatus } from "@/types/halal";

const classifySchema = z.object({
  documentType: z.enum([
    "company-registration",
    "premises-license",
    "ingredient-list",
    "process-flow",
  ]),
  confidence: z.number().min(1).max(100),
});

const ingredientSchema = z.object({
  ingredients: z.array(
    z.object({
      ingredientName: z.string(),
      normalizedName: z.string(),
      status: z.enum(["Halal", "Haram", "Ambiguous"]),
      confidence: z.number().min(1).max(100),
      reasoning: z.string(),
    })
  ),
});

function mockClassify(text: string, fileName: string) {
  const source = `${fileName} ${text}`.toLowerCase();
  const normalizedFileName = fileName.toLowerCase();
  let documentType: DocumentType = "ingredient-list";

  if (source.includes("form d") || source.includes("rule 13")) {
    return { documentType: "company-registration", confidence: 95 };
  }

  // Prioritize licensing signals first to avoid false positives
  // from generic words like "company" in municipal license PDFs.
  if (
    source.includes("premis") ||
    source.includes("premises") ||
    source.includes("license") ||
    source.includes("lesen") ||
    source.includes("pelesenan") ||
    source.includes("jabatan pelesenan") ||
    source.includes("perniagaan")
  ) {
    documentType = "premises-license";
  } else if (
    normalizedFileName.endsWith(".xlsx") ||
    normalizedFileName.endsWith(".xls") ||
    normalizedFileName.endsWith(".csv") ||
    source.includes("ingredient") ||
    source.includes("ingredients") ||
    source.includes("ramuan") ||
    source.includes("senarai bahan")
  ) {
    documentType = "ingredient-list";
  } else if (source.includes("ssm") || source.includes("company")) {
    documentType = "company-registration";
  } else if (source.includes("process") || source.includes("flow")) {
    documentType = "process-flow";
  }

  return { documentType, confidence: 74 };
}

function mockIngredientAssessment(rawIngredients: string[]) {
  const haramKeywords = [
    "lard",
    "pork",
    "gelatin",
    "gelatine",
    "gelatin porcine",
    "alcohol",
    "ethanol",
    "rum",
    "wine",
    "beer",
  ];
  const ambiguousPriorityKeywords = ["minyak sapi", "beef tallow"];
  const ambiguousKeywords = ["emulsifier", "shortening", "flavor", "enzyme", "glycerin"];

  return rawIngredients.map((ingredient) => {
    const lower = ingredient.toLowerCase();
    const normalizedName = lower
      .replace("minyak sapi", "beef tallow")
      .replace("lemak babi", "lard")
      .trim();

    let status: IngredientStatus = "Halal";
    let confidence = 80;
    let reasoning = "No obvious red-flag markers from a basic rule-based pass.";

    if (ambiguousPriorityKeywords.some((item) => normalizedName.includes(item))) {
      status = "Ambiguous";
      confidence = 58;
      reasoning = "Minyak sapi / beef tallow requires source-trace confirmation for halal assurance.";
    } else if (haramKeywords.some((item) => normalizedName.includes(item))) {
      status = "Haram";
      confidence = 88;
      reasoning = "Detected gelatin/alcohol/pork marker that is treated as non-halal in this prototype.";
    } else if (ambiguousKeywords.some((item) => normalizedName.includes(item))) {
      status = "Ambiguous";
      confidence = 52;
      reasoning = "Ingredient origin is unclear and requires supporting supplier proof.";
    }

    return {
      ingredientName: ingredient,
      normalizedName,
      status,
      confidence,
      reasoning,
    };
  });
}

function parseIngredientsFromText(text: string) {
  const cleaned = text
    // Keep readable characters and common punctuation only.
    .replace(/[^\x20-\x7E\r\n,;:()%\-./]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const lower = cleaned.toLowerCase();
  const anchorKeywords = ["ingredient", "ingredients", "ramuan", "bahan", "komposisi", "composition"];
  const anchor = anchorKeywords.find((keyword) => lower.includes(keyword));

  let focused = "";
  if (anchor) {
    const start = lower.indexOf(anchor);
    focused = cleaned.slice(start);
  } else {
    // Fallback for ingredient files that are just comma-separated values
    // without an explicit "ingredient/ramuan/bahan" header.
    focused = cleaned;
  }

  const rawTokens = focused
    .split(/,|;|\n|\||\./)
    .map((piece) => piece.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9()%\- ]+$/g, "").trim())
    .filter((piece) => piece.length >= 3 && piece.length <= 60);

  const stopwords = new Set([
    "ingredient",
    "ingredients",
    "ramuan",
    "bahan",
    "composition",
    "contains",
    "manufactured by",
    "xml",
    "supplier",
    "supplier name",
    "ingredient supplier",
    "company",
    "company name",
    "sdn bhd",
    "enterprise",
    "certificate",
    "halal certificate",
    "cert no",
    "jakim",
    "address",
    "email",
    "phone",
  ]);

  const deduped = new Set<string>();
  const result: string[] = [];
  const likelyIngredientWords = [
    "gula",
    "garam",
    "tepung",
    "minyak",
    "susu",
    "koko",
    "coklat",
    "air",
    "perisa",
    "flour",
    "sugar",
    "salt",
    "oil",
    "milk",
    "cocoa",
    "flavour",
    "flavor",
    "starch",
    "emulsifier",
    "lecithin",
    "soy",
    "chicken",
    "beef",
    "meat",
    "poultry",
    "fish",
    "lamb",
    "gelatin",
  ];

  for (const token of rawTokens) {
    const normalized = token.toLowerCase();
    const alphaChars = (normalized.match(/[a-z]/g) ?? []).length;
    const vowels = (normalized.match(/[aeiou]/g) ?? []).length;
    const invalidSymbols = (normalized.match(/[^a-z0-9()%\- ]/g) ?? []).length;
    const alphaRatio = alphaChars / Math.max(normalized.length, 1);

    // Ignore noisy fragments often produced by basic PDF extraction.
    if (alphaRatio < 0.45) continue;
    if (vowels < 2) continue;
    if (invalidSymbols > 0) continue;
    if (normalized.includes("\\")) continue;
    if (stopwords.has(normalized)) continue;
    if (deduped.has(normalized)) continue;
    if (
      normalized.includes("supplier") ||
      normalized.includes("sdn bhd") ||
      normalized.includes("enterprise") ||
      normalized.includes("company") ||
      normalized.includes("certificate") ||
      normalized.includes("jakim")
    ) {
      continue;
    }

    if (!anchor) {
      const looksLikeIngredient = likelyIngredientWords.some((word) => normalized.includes(word));
      // In fallback mode, be stricter so random PDF noise does not pass.
      if (!looksLikeIngredient && token.split(" ").length > 4) continue;
    }

    deduped.add(normalized);
    result.push(token);
  }

  return result;
}

function hasUsableOpenAiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return false;
  if (key.includes("your_openai_api_key_here")) return false;
  if (key.startsWith("your_")) return false;
  return true;
}

export async function classifyDocumentAction(input: { text: string; fileName: string }) {
  const text = input.text.slice(0, 12000);
  const fileName = input.fileName;
  const normalizedFileName = fileName.toLowerCase();

  if (normalizedFileName.includes("form d") || normalizedFileName.includes("rule 13")) {
    return {
      documentType: "company-registration" as const,
      confidence: 96,
    };
  }

  // Deterministic fast-path for common local authority licensing files.
  if (
    normalizedFileName.includes("pelesenan") ||
    normalizedFileName.includes("jabatan pelesenan") ||
    normalizedFileName.includes("premises") ||
    normalizedFileName.includes("lesen")
  ) {
    return {
      documentType: "premises-license" as const,
      confidence: 94,
    };
  }

  if (
    normalizedFileName.endsWith(".xlsx") ||
    normalizedFileName.endsWith(".xls") ||
    normalizedFileName.endsWith(".csv") ||
    normalizedFileName.includes("ingredient") ||
    normalizedFileName.includes("ramuan") ||
    normalizedFileName.includes("senarai-bahan")
  ) {
    return {
      documentType: "ingredient-list" as const,
      confidence: 95,
    };
  }

  if (!hasUsableOpenAiKey()) {
    return mockClassify(text, fileName);
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: classifySchema,
      prompt: `Classify this uploaded business file into one of:
- company-registration
- premises-license
- ingredient-list
- process-flow

Return a confidence score from 1 to 100.
File name: ${fileName}
Document text:
${text}`,
    });

    return object;
  } catch {
    return mockClassify(text, fileName);
  }
}

export async function verifyIngredientsAction(input: { text: string }) {
  const text = input.text.slice(0, 16000);
  const parsedIngredients = parseIngredientsFromText(text);

  if (parsedIngredients.length === 0) {
    return { ingredients: [] };
  }

  if (!hasUsableOpenAiKey()) {
    return { ingredients: mockIngredientAssessment(parsedIngredients) };
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: ingredientSchema,
      prompt: `You are an expert halal auditor.
You will verify ingredients and normalize names.
Map common Malay/Manglish to normalized English terms where relevant, for example:
- "minyak sapi" => "beef tallow"
- "lemak babi" => "lard"

For each ingredient return:
- ingredientName
- normalizedName
- status (Halal, Haram, Ambiguous)
- confidence (1-100)
- reasoning (short and audit-friendly)

Rules to enforce:
- Any ingredient containing gelatin/gelatine or alcohol/ethanol should be marked Haram.
- "minyak sapi" (beef tallow) should be marked Ambiguous.
- Return all detectable ingredients from the provided text, not just a small sample.

Document text:
${text}`,
    });

    return object;
  } catch {
    return { ingredients: mockIngredientAssessment(parsedIngredients) };
  }
}
