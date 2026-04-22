"use client";

import { useEffect, useRef, useState } from "react";

type Message = { id: string; role: string; content: string; createdAt: string };

const QUICK_PROMPTS = [
  "What should I train today?",
  "How am I progressing?",
  "Suggest my next workout with weights",
  "Am I training enough this week?",
  "What are my weakest areas?",
];

export default function AITrainer() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      fetch("/api/trainer")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setMessages(data);
        });
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setInput("");
    setLoading(true);
    setStreaming("");

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("/api/trainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        full += chunk;
        setStreaming(full);
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: full,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreaming("");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isEmpty = messages.length === 0 && !streaming;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 w-14 h-14 bg-orange-500 hover:bg-orange-400 rounded-full shadow-lg shadow-orange-500/30 flex items-center justify-center text-2xl transition-all active:scale-95"
        aria-label="Open AI Trainer"
      >
        🤖
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 pt-12 pb-4 border-b border-zinc-800 bg-zinc-900">
            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-xl">
              🤖
            </div>
            <div className="flex-1">
              <h2 className="text-white font-bold text-base">AI Coach</h2>
              <p className="text-zinc-500 text-xs">Knows your lifts, PRs & history</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-zinc-500 hover:text-white text-2xl p-1 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {isEmpty && (
              <div className="text-center pt-8">
                <div className="text-5xl mb-3">💪</div>
                <h3 className="text-white font-semibold mb-1">Your personal coach</h3>
                <p className="text-zinc-500 text-sm mb-6">
                  I know your workout history, PRs, and goals. Ask me anything.
                </p>
                <div className="space-y-2">
                  {QUICK_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      className="w-full text-left bg-zinc-900 border border-zinc-800 hover:border-orange-500/40 text-zinc-300 hover:text-white text-sm px-4 py-3 rounded-xl transition-all"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center text-sm mr-2 flex-shrink-0 mt-0.5">
                    🤖
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-orange-500 text-white rounded-br-sm"
                      : "bg-zinc-800 text-zinc-100 rounded-bl-sm"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {/* Streaming */}
            {streaming && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center text-sm mr-2 flex-shrink-0 mt-0.5">
                  🤖
                </div>
                <div className="max-w-[85%] bg-zinc-800 text-zinc-100 rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                  {streaming}
                  <span className="inline-block w-1 h-4 bg-orange-400 ml-0.5 animate-pulse" />
                </div>
              </div>
            )}

            {/* Typing indicator */}
            {loading && !streaming && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center text-sm mr-2 flex-shrink-0">
                  🤖
                </div>
                <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Quick prompts when there are messages */}
          {!isEmpty && !loading && (
            <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
              {QUICK_PROMPTS.slice(0, 3).map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="flex-shrink-0 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white px-3 py-2 rounded-xl transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-4 pb-8 pt-2 bg-zinc-900 border-t border-zinc-800">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send(input)}
                placeholder="Ask your coach..."
                disabled={loading}
                className="flex-1 bg-zinc-800 text-white placeholder-zinc-600 text-sm px-4 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-50"
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
                className="bg-orange-500 disabled:opacity-30 hover:bg-orange-400 text-white px-4 py-3 rounded-xl font-medium text-sm transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
