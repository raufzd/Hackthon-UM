"use client";

import { useMemo, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function readDashboardContext() {
  const rawMvp = localStorage.getItem("halalchain-mvp-state");
  const rawDocs = localStorage.getItem("halalchain_docs");
  const rawIngredients = localStorage.getItem("halalchain_ingredients");

  let documentState: unknown = [];
  let ingredientState: unknown = [];

  if (rawMvp) {
    try {
      const parsed = JSON.parse(rawMvp) as { documents?: unknown; ingredients?: unknown };
      documentState = parsed.documents ?? [];
      ingredientState = parsed.ingredients ?? [];
    } catch {
      documentState = [];
      ingredientState = [];
    }
  }

  if (rawDocs) {
    try {
      documentState = JSON.parse(rawDocs);
    } catch {
      // keep existing fallback
    }
  }

  if (rawIngredients) {
    try {
      ingredientState = JSON.parse(rawIngredients);
    } catch {
      // keep existing fallback
    }
  }

  return { documentState, ingredientState };
}

export function AIChatbox() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi! I am your JAKIM Halal assistant. Ask me what document to fix or halal alternatives for any haram/ambiguous ingredient.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const trimmedInput = useMemo(() => input.trim(), [input]);

  async function sendMessage(event?: React.FormEvent) {
    event?.preventDefault();
    if (!trimmedInput || isLoading) return;

    const nextUserMessage: ChatMessage = { role: "user", content: trimmedInput };
    const nextMessages = [...messages, nextUserMessage];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      const { documentState, ingredientState } = readDashboardContext();

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          documentState,
          ingredientState,
        }),
      });

      const data = (await response.json()) as { reply?: string; error?: string; details?: string };
      if (!response.ok || !data.reply) {
        const message = data.error
          ? `${data.error}${data.details ? `: ${data.details}` : ""}`
          : "Unable to get response from assistant.";
        setMessages((prev) => [...prev, { role: "assistant", content: message }]);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply! }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error while contacting the assistant. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => messageEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {!isOpen ? (
        <Button
          onClick={() => setIsOpen(true)}
          className="h-12 w-12 rounded-full bg-primary p-0 shadow-lg hover:bg-primary-dark"
          aria-label="Open AI chatbox"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      ) : (
        <div className="w-[360px] rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 p-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">JAKIM Assistant</p>
              <p className="text-xs text-slate-500">GLM-powered support</p>
            </div>
            <button className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => setIsOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="h-80 space-y-3 overflow-y-auto p-3">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                  message.role === "user"
                    ? "ml-auto bg-primary text-white"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                {message.content}
              </div>
            ))}
            {isLoading ? (
              <div className="max-w-[90%] rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
                Assistant is typing...
              </div>
            ) : null}
            <div ref={messageEndRef} />
          </div>

          <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-slate-200 p-3">
            <input
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="Ask how to fix docs or halal alternatives..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={!trimmedInput || isLoading}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
