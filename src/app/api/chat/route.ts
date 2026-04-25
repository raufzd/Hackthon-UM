import { NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatPayload = {
  messages: ChatMessage[];
  documentState: unknown;
  ingredientState: unknown;
};

const SYSTEM_PROMPT =
  "You are a professional JAKIM Halal Certification Assistant. You have access to the user's current document statuses and ingredient list. Task 1: If their documents have errors, are missing, or have bad naming conventions, guide them on exactly how to fix and re-upload them. Task 2: If they ask about or possess ingredients marked as 'Haram' or 'Ambiguous', you must proactively suggest Halal-certified alternatives (e.g., replacing 'pork gelatin' with 'agar-agar' or 'halal-certified bovine gelatin'). Be concise, helpful, and use Malaysian context where appropriate.";

function buildQuotaFallbackReply(documentState: unknown, ingredientState: unknown) {
  const docs = Array.isArray(documentState) ? documentState : [];
  const ingredients = Array.isArray(ingredientState) ? ingredientState : [];

  const required = ["company-registration", "premises-license", "ingredient-list", "process-flow"];
  const present = new Set(
    docs
      .map((doc) =>
        doc && typeof doc === "object" && "documentType" in doc
          ? String((doc as { documentType?: string }).documentType)
          : ""
      )
      .filter(Boolean)
  );
  const missing = required.filter((item) => !present.has(item));

  const haram = ingredients.filter(
    (item) => item && typeof item === "object" && "status" in item && (item as { status?: string }).status === "Haram"
  );
  const ambiguous = ingredients.filter(
    (item) =>
      item && typeof item === "object" && "status" in item && (item as { status?: string }).status === "Ambiguous"
  );

  const lines: string[] = [];

  if (missing.length > 0) {
    lines.push(`Missing JAKIM docs: ${missing.join(", ")}.`);
    lines.push(
      "Please re-upload with clear names, e.g. `company-registration.pdf`, `premises-license.pdf`, `ingredient-list.xlsx`, `process-flow.pdf`."
    );
  } else {
    lines.push("Your core document checklist looks complete.");
  }

  if (haram.length > 0) {
    lines.push(
      `Haram items detected: ${haram
        .map((item) =>
          item && typeof item === "object" && "ingredientName" in item
            ? String((item as { ingredientName?: string }).ingredientName)
            : "Unknown ingredient"
        )
        .join(", ")}.`
    );
    lines.push(
      "Suggested halal alternatives: pork gelatin -> agar-agar or halal-certified bovine gelatin; alcohol flavor carrier -> glycerol or halal-certified emulsifier base."
    );
  }

  if (ambiguous.length > 0) {
    lines.push(
      `Ambiguous items: ${ambiguous
        .map((item) =>
          item && typeof item === "object" && "ingredientName" in item
            ? String((item as { ingredientName?: string }).ingredientName)
            : "Unknown ingredient"
        )
        .join(", ")}.`
    );
    lines.push("Request supplier verification with halal cert number and supporting evidence for each ambiguous ingredient.");
  }

  if (haram.length === 0 && ambiguous.length === 0) {
    lines.push("No Haram/Ambiguous items found in current state. You can proceed to final JAKIM export checks.");
  }

  return lines.join("\n\n");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatPayload;

    if (!body?.messages || !Array.isArray(body.messages)) {
      return NextResponse.json({ error: "Invalid messages payload." }, { status: 400 });
    }

    const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim().replace(/^['"]|['"]$/g, "");
    if (!geminiKey) {
      return NextResponse.json(
        { error: "GOOGLE_GENERATIVE_AI_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const configuredModel = process.env.GEMINI_CHAT_MODEL?.trim();
    const modelCandidates = [
      configuredModel,
      "gemini-1.5-flash-latest",
      "gemini-1.5-flash-8b-latest",
      "gemini-2.0-flash",
      "gemini-2.0-flash-001",
    ].filter(Boolean) as string[];

    const contextMessage: ChatMessage = {
      role: "system",
      content: `Current SME context:
documentState: ${JSON.stringify(body.documentState, null, 2)}
ingredientState: ${JSON.stringify(body.ingredientState, null, 2)}`,
    };

    let lastError = "";
    for (const modelName of modelCandidates) {
      try {
        const { text } = await generateText({
          model: google(modelName),
          temperature: 0.3,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            contextMessage,
            ...body.messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
          ],
        });

        if (text?.trim()) {
          return NextResponse.json({ reply: text.trim(), model: modelName });
        }
      } catch (error) {
        lastError = error instanceof Error ? `${modelName}: ${error.message}` : `${modelName}: unknown error`;
      }
    }

    const details = lastError || "All model attempts failed.";
    const quotaLikeError =
      /quota|rate.?limit|exceeded|billing|free_tier_input_token_count|free_tier_requests/i.test(details);

    if (quotaLikeError) {
      return NextResponse.json({
        reply: buildQuotaFallbackReply(body.documentState, body.ingredientState),
        warning: "Gemini quota exceeded; offline guidance mode used.",
        details,
      });
    }

    return NextResponse.json(
      {
        error: "No supported Gemini model is available for this key/project.",
        details,
      },
      { status: 502 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Unexpected server error.", details: message }, { status: 500 });
  }
}
