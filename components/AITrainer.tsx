"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

const MD_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="text-[20px] font-bold tracking-tight leading-tight mt-3 mb-2">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-[17px] font-bold tracking-tight leading-tight mt-4 mb-2">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[15px] font-semibold tracking-tight leading-tight mt-3 mb-1.5">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="text-[15px] leading-[1.6] mb-3 last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="space-y-1 mb-3 pl-1 list-none">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="space-y-1 mb-3 pl-5 list-decimal">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-[15px] leading-[1.6] flex gap-2 items-start">
      <span
        className="mt-[0.55rem] w-[4px] h-[4px] rounded-full shrink-0"
        style={{ background: "var(--accent)" }}
      />
      <span className="flex-1">{children}</span>
    </li>
  ),
  strong: ({ children }) => (
    <strong
      className="font-bold"
      style={{ color: "var(--fg)" }}
    >
      {children}
    </strong>
  ),
  em: ({ children }) => <em className="italic opacity-90">{children}</em>,
  code: ({ children }) => (
    <code
      className="px-1.5 py-0.5 rounded text-[13px] nums"
      style={{
        background: "var(--bg-elevated)",
        fontFamily: "var(--font-geist-mono)",
        color: "var(--accent)",
      }}
    >
      {children}
    </code>
  ),
  hr: () => (
    <hr
      className="my-4 border-0 h-px"
      style={{ background: "var(--border)" }}
    />
  ),
  blockquote: ({ children }) => (
    <blockquote
      className="pl-3 my-3 italic"
      style={{
        borderLeft: "2px solid var(--accent)",
        color: "var(--fg-muted)",
      }}
    >
      {children}
    </blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: "var(--accent)" }}
      className="underline underline-offset-2"
    >
      {children}
    </a>
  ),
};

const QUICK_PROMPTS = [
  "What should I train today?",
  "How am I progressing?",
  "Suggest my next workout with weights",
  "Am I training enough this week?",
  "What are my weakest areas?",
];

export default function AITrainer() {
  const pathname = usePathname();
  const search = useSearchParams();
  const hideForChat =
    pathname === "/" &&
    search.get("view")?.startsWith("group-") &&
    search.get("mode") === "chat";

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [clearedAt, setClearedAt] = useState<number>(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastUserAnchorRef = useRef<HTMLDivElement>(null);
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = parseInt(
        localStorage.getItem("sl:coachClearedAt") || "0",
        10
      );
      setClearedAt(Number.isFinite(saved) ? saved : 0);
    }
  }, []);

  // Auto-close the coach when the user navigates to a different page
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock background scroll while the modal is open so the underlying
  // page can't bleed in at the bottom when the mobile keyboard opens.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY;
    const prev = {
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      htmlOverflow: html.style.overflow,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    html.style.overflow = "hidden";
    return () => {
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.width = prev.bodyWidth;
      html.style.overflow = prev.htmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  const clearChat = () => {
    const now = Date.now();
    setClearedAt(now);
    setStreaming("");
    if (typeof window !== "undefined") {
      localStorage.setItem("sl:coachClearedAt", String(now));
    }
  };

  const visibleMessages = messages.filter(
    (m) => new Date(m.createdAt).getTime() > clearedAt
  );

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

  // Anchor-on-user-message scroll: when a new user message lands, pin it
  // to the top of the scroll area so the coach's reply reads from the top.
  // We do NOT auto-scroll while streaming — the user is reading.
  useEffect(() => {
    const lastUser = [...visibleMessages]
      .reverse()
      .find((m) => m.role === "user");
    if (!lastUser || lastUser.id === lastUserIdRef.current) return;
    lastUserIdRef.current = lastUser.id;
    requestAnimationFrame(() => {
      const el = lastUserAnchorRef.current;
      const scroller = scrollerRef.current;
      if (!el || !scroller) return;
      // Align the user message to the top with a small offset.
      const offset =
        el.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        8;
      scroller.scrollBy({ top: offset, behavior: "smooth" });
    });
  }, [visibleMessages]);

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

  const isEmpty = visibleMessages.length === 0 && !streaming;

  return (
    <>
      {!hideForChat && (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-40 w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-transform"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          boxShadow: "0 6px 20px -6px rgba(0,0,0,0.6)",
        }}
        aria-label="Open Personalized Coach"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a3 3 0 0 1 3 3v1h1a4 4 0 0 1 4 4v1a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-1v1a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-1H3a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3h1V10a4 4 0 0 1 4-4h1V5a3 3 0 0 1 3-3Z" />
          <circle cx="9" cy="13" r="1" fill="var(--accent)" />
          <circle cx="15" cy="13" r="1" fill="var(--accent)" />
        </svg>
      </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{
            background: "var(--bg)",
            height: "100dvh",
            maxHeight: "100dvh",
          }}
        >
          <div
            className="flex items-center gap-2 px-3 pb-3"
            style={{
              paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-card)",
            }}
          >
            <button
              onClick={() => setOpen(false)}
              className="w-11 h-11 flex items-center justify-center rounded-full active:scale-95 transition-transform"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
              aria-label="Close coach"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] font-semibold tracking-tight leading-none">
                Coach
              </h2>
              <p
                className="text-[10px] label mt-0.5"
                style={{ color: "var(--fg-dim)" }}
              >
                {visibleMessages.length === 0
                  ? "Fresh conversation"
                  : `${visibleMessages.length} message${visibleMessages.length === 1 ? "" : "s"}`}
              </p>
            </div>
            {visibleMessages.length > 0 && (
              <button
                onClick={clearChat}
                className="h-9 px-3 rounded-full text-[12px] label"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--fg-muted)",
                }}
                aria-label="Start a fresh chat"
                title="Clears the on-screen chat. Coach still remembers your training history."
              >
                Clear
              </button>
            )}
          </div>

          <div
            ref={scrollerRef}
            className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
          >
            {isEmpty && (
              <div className="text-center pt-8 max-w-sm mx-auto">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
                  style={{
                    background: "var(--accent-dim)",
                    border: "1px solid rgba(34,197,94,0.25)",
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 4h2v16H6zM16 4h2v16h-2zM3 8h3v8H3zM18 8h3v8h-3zM8 11h8v2H8z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold tracking-tight mb-1.5">
                  Your personalized coach
                </h3>
                <p
                  className="text-sm leading-relaxed mb-6"
                  style={{ color: "var(--fg-muted)" }}
                >
                  {messages.length > 0
                    ? "Fresh chat. Your training history and PRs are still in my memory — ask anything."
                    : "I know every session you've logged, your PRs, and your goals. Ask me anything."}
                </p>
                <div className="space-y-2">
                  {QUICK_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      className="w-full text-left text-sm px-4 py-3 rounded-xl transition-all"
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        color: "var(--fg-muted)",
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(() => {
              const lastUserId = [...visibleMessages]
                .reverse()
                .find((m) => m.role === "user")?.id;
              return visibleMessages.map((m) => (
                <div
                  key={m.id}
                  ref={m.id === lastUserId ? lastUserAnchorRef : undefined}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                {m.role === "user" ? (
                  <div
                    className="max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-[1.5] whitespace-pre-wrap"
                    style={{
                      background: "var(--accent)",
                      color: "#0a0a0a",
                      borderBottomRightRadius: "6px",
                      fontWeight: 500,
                    }}
                  >
                    {m.content}
                  </div>
                ) : (
                  <div
                    className="max-w-[92%] rounded-2xl px-4 py-3.5"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      color: "var(--fg)",
                      borderBottomLeftRadius: "6px",
                    }}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={MD_COMPONENTS}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
              ));
            })()}

            {streaming && (
              <div className="flex justify-start">
                <div
                  className="max-w-[92%] rounded-2xl px-4 py-3.5"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderBottomLeftRadius: "6px",
                  }}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={MD_COMPONENTS}
                  >
                    {streaming}
                  </ReactMarkdown>
                  <span
                    className="inline-block w-[2px] h-4 ml-0.5 align-middle animate-pulse"
                    style={{ background: "var(--accent)" }}
                  />
                </div>
              </div>
            )}

            {loading && !streaming && (
              <div className="flex justify-start">
                <div
                  className="rounded-2xl px-4 py-3 flex gap-1.5 items-center"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderBottomLeftRadius: "6px",
                  }}
                >
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{
                        background: "var(--fg-dim)",
                        animationDelay: `${i * 0.15}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {!isEmpty && !loading && (
            <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
              {QUICK_PROMPTS.slice(0, 3).map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="flex-shrink-0 text-[11px] px-3 py-2 rounded-full transition-colors whitespace-nowrap"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    color: "var(--fg-muted)",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          <div
            className="px-3 pt-2.5"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
              borderTop: "1px solid var(--border)",
              background: "var(--bg-card)",
            }}
          >
            <div
              className="flex items-end gap-0 rounded-2xl overflow-hidden pr-1.5"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !e.shiftKey && send(input)
                }
                placeholder="Message Coach"
                disabled={loading}
                className="flex-1 text-[15px] px-4 py-3 focus:outline-none disabled:opacity-50 bg-transparent"
                style={{ color: "var(--fg)" }}
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
                className="my-1 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30 transition-opacity"
                style={{
                  background: input.trim() ? "var(--accent)" : "var(--border)",
                  color: "#0a0a0a",
                }}
                aria-label="Send"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
