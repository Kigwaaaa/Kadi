"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, KadiEmit } from "@/lib/api";

export function ChatPanel({
  messages,
  emit,
  connected,
  muted,
}: {
  messages: ChatMessage[];
  emit: KadiEmit;
  connected: boolean;
  muted: boolean;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousCount = useRef(messages.length);
  const desktopEnd = useRef<HTMLDivElement>(null);
  const drawerEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const newMessages = messages.length - previousCount.current;
    const desktopVisible =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches;
    if (newMessages > 0 && !drawerOpen && !desktopVisible) {
      setUnread((count) => count + newMessages);
    }
    previousCount.current = messages.length;
    desktopEnd.current?.scrollIntoView({ behavior: "smooth" });
    drawerEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [drawerOpen, messages]);

  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || text.length > 300 || muted || !connected || sending) return;
    setSending(true);
    setError(null);
    const result = await emit("chat:send", { text });
    setSending(false);
    if (!result.ok) {
      setError(
        result.code === "RATE_LIMITED"
          ? "You’re sending messages too quickly. Try again shortly."
          : "Message couldn’t be sent. Please try again.",
      );
      return;
    }
    setDraft("");
  };

  const transcript = (endRef: React.RefObject<HTMLDivElement | null>) => (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
      role="log"
    >
      {messages.length === 0 ? (
        <p className="py-6 text-center text-sm text-[#788178]">
          No messages yet. Say hello!
        </p>
      ) : (
        messages.map((message) =>
          message.type === "system" ? (
            <p
              className="text-center text-xs font-semibold text-[#788178]"
              key={message.id}
            >
              {message.text}
            </p>
          ) : (
            <article
              className="rounded-xl bg-[#f4efe7] px-3 py-2"
              key={message.id}
            >
              <p className="text-xs font-extrabold text-[#52634f]">
                {message.name}
              </p>
              <p className="mt-0.5 break-words text-sm text-[#26342b]">
                {message.text}
              </p>
            </article>
          ),
        )
      )}
      <div ref={endRef} />
    </div>
  );

  const composer = (
    <form className="border-t border-[#eee7db] p-3" onSubmit={send}>
      {muted && (
        <p className="mb-2 rounded-lg bg-[#f4efe7] px-3 py-2 text-xs font-semibold text-[#68736b]">
          You’re muted in chat by the room owner.
        </p>
      )}
      {error && (
        <p className="mb-2 text-xs font-semibold text-[#a3422d]" role="alert">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor="chat-message">
          Chat message
        </label>
        <textarea
          className="min-h-11 flex-1 resize-none rounded-xl border border-[#d8d0c3] bg-white px-3 py-2 text-sm outline-none focus:border-[#c64f32] focus:ring-2 focus:ring-[#c64f32]/15 disabled:bg-[#f4efe7]"
          disabled={muted || !connected || sending}
          id="chat-message"
          maxLength={300}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={muted ? "Chat is muted" : "Write a message…"}
          rows={1}
          value={draft}
        />
        <button
          aria-label="Send chat message"
          className="min-h-11 rounded-xl bg-[#315e40] px-3 text-sm font-extrabold text-white hover:bg-[#264b32] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={
            !draft.trim() ||
            draft.trim().length > 300 ||
            muted ||
            !connected ||
            sending
          }
          type="submit"
        >
          Send
        </button>
      </div>
      <p className="mt-1 text-right text-[10px] text-[#788178]">
        {draft.length}/300 · Enter to send
      </p>
    </form>
  );

  const panel = (endRef: React.RefObject<HTMLDivElement | null>) => (
    <section
      aria-label="Room chat"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#e5dccd] bg-[#fffdf8] shadow-sm"
    >
      <header className="border-b border-[#eee7db] px-4 py-3">
        <h2 className="font-extrabold">Room chat</h2>
        <p className="text-xs text-[#788178]">Messages are plain text.</p>
      </header>
      {transcript(endRef)}
      {composer}
    </section>
  );

  return (
    <>
      <aside className="hidden h-[min(76vh,44rem)] min-h-96 lg:flex">
        <div className="flex w-full">{panel(desktopEnd)}</div>
      </aside>
      <button
        aria-label={
          unread > 0 ? `Open chat, ${unread} unread messages` : "Open chat"
        }
        className="fixed bottom-4 right-4 z-30 min-h-12 rounded-full bg-[#315e40] px-5 text-sm font-extrabold text-white shadow-xl hover:bg-[#264b32] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c64f32] lg:hidden"
        onClick={() => {
          setDrawerOpen(true);
          setUnread(0);
        }}
        type="button"
      >
        Chat{unread > 0 && ` · ${unread}`}
      </button>
      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-[#18221c]/50 p-2 lg:hidden">
          <div className="flex h-[min(82svh,42rem)] w-full flex-col rounded-t-[1.5rem] bg-[#fffdf8] p-2 shadow-2xl">
            <div className="flex justify-end pb-2">
              <button
                aria-label="Close chat"
                className="min-h-10 rounded-lg px-3 text-sm font-bold text-[#59645c] hover:bg-[#f4efe7] focus-visible:outline-2 focus-visible:outline-[#cf5939]"
                onClick={() => setDrawerOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
            {panel(drawerEnd)}
          </div>
        </div>
      )}
    </>
  );
}
