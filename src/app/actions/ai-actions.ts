"use server";

import { google } from "@ai-sdk/google";
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

const alternativesSchema = z.object({
  alternatives: z.array(
    z.object({
      name: z.string(),
      reason: z.string(),
    })
  ),
});

function hasUsableGeminiKey() {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return false;
  if (key.includes("your_")) return false;
  return true;
}

function mockClassify(text: string, fileName: string) {
  const source = `${fileName} ${text}`.toLowerCase();
  const normalizedFileName = fileName.toLowerCase();
  let documentType: DocumentType = "ingredient-list";

  if (source.includes("form d") || source.includes("rule 13")) {
    return { documentType: "company-registration" as const, confidence: 95 };
  }

  if (
    source.includes("premis") ||
    source.includes("premises") ||
    source.includes("license") ||
    source.includes("lesen") ||
    source.includes("pelesenan") ||
    source.includes("jabatan pelesenan")
  ) {
    return { documentType: "premises-license" as const, confidence: 92 };
  }

  if (
    normalizedFileName.endsWith(".xlsx") ||
    normalizedFileName.endsWith(".xls") ||
    normalizedFileName.endsWith(".csv") ||
    source.includes("ingredient") ||
    source.includes("ingredients") ||
    source.includes("ramuan") ||
    source.includes("senarai bahan")
  ) {
    return { documentType: "ingredient-list" as const, confidence: 93 };
  }

  if (source.includes("ssm") || source.includes("company")) {
    documentType = "company-registration";
  } else if (source.includes("process") || source.includes("flow")) {
    documentType = "process-flow";
  }

  return { documentType, confidence: 74 };
}

function parseIngredientsFromText(text: string) {
  const cleaned = text
    .replace(/[^\x20-\x7E\r\n,;:()%\-./]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return [];

  const rawTokens = cleaned
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
    "supplier",
    "company",
    "certificate",
    "jakim",
    "address",
    "email",
    "phone",
  ]);

  const deduped = new Set<string>();
  const result: string[] = [];
  for (const token of rawTokens) {
    const normalized = token.toLowerCase();
    const alphaChars = (normalized.match(/[a-z]/g) ?? []).length;
    const alphaRatio = alphaChars / Math.max(normalized.length, 1);
    if (alphaRatio < 0.45) continue;
    if (stopwords.has(normalized)) continue;
    if (deduped.has(normalized)) continue;
    deduped.add(normalized);
    result.push(token);
  }
  return result;
}

function mockIngredientAssessment(rawIngredients: string[]) {
  const haramKeywords = ["lard", "pork", "gelatin", "gelatine", "alcohol", "ethanol", "rum", "wine", "beer"];
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

export async function classifyDocumentAction(input: { text: string; fileName: string }) {
  const text = input.text.slice(0, 12000);
  const fileName = input.fileName;
  const source = `${fileName} ${text}`.toLowerCase();
  const normalizedFileName = fileName.toLowerCase();

  // Deterministic fast-path classification to stabilize compliance checker results.
  if (source.includes("form d") || source.includes("rule 13")) {
    return { documentType: "company-registration" as const, confidence: 96 };
  }

  if (
    source.includes("premis") ||
    source.includes("premises") ||
    source.includes("pbt") ||
    source.includes("license") ||
    source.includes("lesen") ||
    source.includes("pelesenan") ||
    source.includes("jabatan pelesenan")
  ) {
    return { documentType: "premises-license" as const, confidence: 95 };
  }

  if (
    source.includes("process flow") ||
    source.includes("flow chart") ||
    source.includes("process-flow") ||
    source.includes("production flow") ||
    normalizedFileName.includes("process") ||
    normalizedFileName.includes("flow")
  ) {
    return { documentType: "process-flow" as const, confidence: 95 };
  }

  if (
    normalizedFileName.endsWith(".xlsx") ||
    normalizedFileName.endsWith(".xls") ||
    normalizedFileName.endsWith(".csv") ||
    source.includes("ingredient") ||
    source.includes("ingredients") ||
    source.includes("ramuan") ||
    source.includes("senarai bahan")
  ) {
    return { documentType: "ingredient-list" as const, confidence: 95 };
  }

  if (!hasUsableGeminiKey()) {
    return mockClassify(text, fileName);
  }

  try {
    const { object } = await generateObject({
      model: google("gemini-1.5-flash"),
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
  const text = input.text.slice(0, 18000);
  const parsedIngredients = parseIngredientsFromText(text);
  if (parsedIngredients.length === 0) return { ingredients: [] };

  if (!hasUsableGeminiKey()) {
    return { ingredients: mockIngredientAssessment(parsedIngredients) };
  }

  try {
    const { object } = await generateObject({
      model: google("gemini-1.5-flash"),
      schema: ingredientSchema,
      prompt: `You are an expert halal auditor.
Verify ingredients and normalize names.
Map common Malay/Manglish terms where relevant:
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
- Return all detectable ingredients from the provided text.

Document text:
${text}`,
    });
    return object;
  } catch {
    return { ingredients: mockIngredientAssessment(parsedIngredients) };
  }
}

export async function suggestHalalAlternativesAction(input: {
  ingredientName: string;
  normalizedName?: string;
}) {
  const ingredientName = input.ingredientName.trim();
  const normalized = input.normalizedName?.trim() ?? ingredientName;
  const key = `${ingredientName} ${normalized}`.toLowerCase();

  const ruleBasedAlternatives = (() => {
    // Common "ambiguous -> haram" cases: E-codes/emulsifiers without halal source proof.
    if (
      key.includes("e471") ||
      key.includes("emulsifier") ||
      key.includes("mono") && key.includes("diglycer") ||
      key.includes("monoglyceride") ||
      key.includes("diglyceride")
    ) {
      return [
        {
          name: "E471 (vegetable source) — halal-certified",
          reason: "Ask supplier to provide halal certificate + vegetable-origin declaration (palm/soy).",
        },
        {
          name: "Sunflower lecithin (E322)",
          reason: "Common plant-derived emulsifier used in bakery/chocolate; easier halal traceability.",
        },
        {
          name: "Polyglycerol esters (vegetable source)",
          reason: "Functional alternative emulsifier; ensure halal certification and vegetable feedstock proof.",
        },
      ];
    }

    if (key.includes("gelatin") || key.includes("gelatine")) {
      return [
        { name: "Agar-agar", reason: "Plant-based gelling agent widely used in Malaysian desserts and confectionery." },
        {
          name: "Halal-certified bovine gelatin",
          reason: "Closest texture profile when sourced from halal-slaughtered bovine and certified.",
        },
        { name: "Pectin", reason: "Fruit-derived stabilizer suitable for jams, gummies, and fillings." },
      ];
    }
    if (key.includes("alcohol") || key.includes("ethanol") || key.includes("wine") || key.includes("rum")) {
      return [
        { name: "Halal-certified flavor emulsion", reason: "Provides flavor delivery without alcohol carrier." },
        { name: "Vegetable glycerin-based extract", reason: "Common halal-friendly solvent for flavor concentrates." },
        { name: "Natural distilled flavor oils", reason: "Can replace alcohol-based extracts in bakery and beverages." },
      ];
    }
    if (key.includes("lard") || key.includes("pork") || key.includes("porcine")) {
      return [
        { name: "Refined palm shortening", reason: "Stable and affordable replacement for texture and mouthfeel." },
        { name: "Halal-certified beef tallow", reason: "Animal-fat replacement when proper halal certification is available." },
        { name: "Coconut oil blend", reason: "Plant-based fat blend suitable for pastry and frying applications." },
      ];
    }
    if (key.includes("blood")) {
      return [
        { name: "Yeast extract", reason: "Provides umami depth without non-halal blood derivatives." },
        { name: "Mushroom concentrate", reason: "Adds savory profile for processed foods and sauces." },
        { name: "Soy protein hydrolysate", reason: "Functional alternative for flavor enhancement in formulations." },
      ];
    }
    return [
      { name: "Agar-agar", reason: "Plant-based replacement commonly accepted in halal formulations." },
      { name: "Halal-certified bovine derivative", reason: "Animal-origin replacement with halal certification traceability." },
      { name: "Pectin", reason: "Fruit-derived stabilizer suitable for many food applications." },
    ];
  })();

  if (!ingredientName) {
    return { alternatives: [] };
  }

  if (!hasUsableGeminiKey()) {
    return { alternatives: ruleBasedAlternatives };
  }

  try {
    const { object } = await generateObject({
      model: google("gemini-1.5-flash"),
      schema: alternativesSchema,
      prompt: `You are a halal food formulation advisor in Malaysia.
Ingredient flagged as Haram:
- ingredientName: ${ingredientName}
- normalizedName: ${normalized}

Return 2-4 practical halal alternatives for SMEs.
Each alternative must include:
- name
- reason (short, practical, Malaysia/JAKIM relevant)
`,
    });
    const merged = [...ruleBasedAlternatives, ...(object.alternatives ?? [])];
    const deduped = new Map<string, { name: string; reason: string }>();
    for (const alt of merged) {
      const altKey = alt.name.toLowerCase();
      if (!deduped.has(altKey)) deduped.set(altKey, alt);
    }
    return { alternatives: Array.from(deduped.values()).slice(0, 4) };
  } catch {
    return { alternatives: ruleBasedAlternatives };
  }
}
