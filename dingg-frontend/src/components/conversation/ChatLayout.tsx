"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* ---------- Types ---------- */
type Sender = "me" | "them";
interface Message {
  id: string;
  sender: Sender;
  text: string;
  at: string; // ISO
  status?: "sent" | "delivered" | "seen"; // for "me"
}
interface Chat {
  id: number;
  name: string;
  avatar?: string; // image url if any
  online?: boolean;
  pinned?: boolean;
  unread?: number;
  messages: Message[];
}

/* ---------- Utils ---------- */
const cn = (...classes: Array<string | false | undefined>) =>
  classes.filter(Boolean).join(" ");

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const isSameDay = (a: string, b: string) => {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
};

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const pad = (x: number) => (x < 10 ? `0${x}` : x);
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());

  if (isSameDay(iso, today.toISOString())) return "Today";
  if (isSameDay(iso, yesterday.toISOString())) return "Yesterday";
  return `${dd}/${mm}/${yyyy}`;
};

/* ---------- Avatars & Icons (inline, no deps) ---------- */
const OnlineDot = ({ online }: { online?: boolean }) => (
  <span
    className={cn(
      "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-gray-900",
      online ? "bg-emerald-500" : "bg-gray-300"
    )}
  />
);

const PlaceholderAvatar = ({ name }: { name: string }) => (
  <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow">
    <span className="text-sm font-semibold">{name.charAt(0)}</span>
  </div>
);

const IconButton = ({
  title,
  onClick,
  children,
}: React.PropsWithChildren<{ title: string; onClick?: () => void }>) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10"
  >
    {children}
  </button>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
    <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" />
  </svg>
);
const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
    <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.09 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.86.33 1.7.62 2.49a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.58-1.17a2 2 0 0 1 2.11-.45c.79.29 1.63.5 2.49.62A2 2 0 0 1 22 16.92Z"/>
  </svg>
);
const VideoIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
    <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.55-2.27A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.89L15 14M3 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/>
  </svg>
);
const InfoIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
    <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 8h.01M11 12h1v4h1m-1-12a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z"/>
  </svg>
);
const PaperclipIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
    <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05 12.1 20.39a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 1 1 4.95 4.95L8.46 18.82"/>
  </svg>
);
const SmileIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
    <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm4-6a4 4 0 0 1-8 0M9 10h.01M15 10h.01"/>
  </svg>
);
const SendIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor">
    <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m22 2-7 7m7-7-9 20-3-9-9-3 20-8Z"/>
  </svg>
);

/* ---------- Message Bubble ---------- */
const MessageBubble: React.FC<{ m: Message }> = ({ m }) => {
  const mine = m.sender === "me";
  return (
    <div className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[70%] rounded-2xl px-4 py-2 shadow",
          mine
            ? "bg-gradient-to-br from-blue-500 to-indigo-500 text-white"
            : "bg-white text-gray-900 dark:bg-white/5 dark:text-gray-100 border border-gray-200/70 dark:border-white/10"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{m.text}</p>
        <div className={cn("mt-1 flex items-center gap-1 text-[10px] opacity-80", mine && "text-white")}>
          <span>{formatTime(m.at)}</span>
          {mine && (
            <span aria-label={m.status ?? "sent"}>
              {m.status === "seen" ? "✓✓" : m.status === "delivered" ? "✓✓" : "✓"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

/* ---------- Main Component ---------- */
export default function ChatLayout() {
  const [query, setQuery] = useState("");
  const [chats, setChats] = useState<Chat[]>([
    {
      id: 1,
      name: "Minh",
      online: true,
      pinned: true,
      unread: 2,
      messages: [
        {
          id: "m1",
          sender: "them",
          text: "Chào Khoa!",
          at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
        },
        {
          id: "m2",
          sender: "me",
          text: "Hello Minh 😎",
          at: new Date(Date.now() - 1000 * 60 * 58).toISOString(),
          status: "seen",
        },
        {
          id: "m3",
          sender: "them",
          text: "Làm giao diện chat tới đâu rồi?",
          at: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
        },
      ],
    },
    {
      id: 2,
      name: "Lan",
      online: false,
      unread: 0,
      messages: [
        {
          id: "l1",
          sender: "them",
          text: "Đi uống cf không?",
          at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        },
        {
          id: "l2",
          sender: "me",
          text: "Ok, mai nhé!",
          at: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
          status: "delivered",
        },
      ],
    },
  ]);
  const [selectedId, setSelectedId] = useState<number>(chats[0].id);
  const [newMessage, setNewMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedId)!,
    [chats, selectedId]
  );

  // Derived for sidebar preview
  const chatPreview = (c: Chat) => {
    const last = c.messages[c.messages.length - 1];
    return last ? last.text : "Start a conversation";
    };

  const chatTime = (c: Chat) => {
    const last = c.messages[c.messages.length - 1];
    return last ? formatTime(last.at) : "";
  };

  // Auto scroll on chat/messages change
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [selectedId, selectedChat.messages.length]);

  // Autosize textarea
  useEffect(() => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [newMessage]);

  // Clear unread when opening chat
  useEffect(() => {
    setChats((prev: Chat[]) =>
      prev.map((c) => (c.id === selectedId ? { ...c, unread: 0 } : c))
    );
  }, [selectedId]);

  const handleSend = () => {
    const text = newMessage.trim();
    if (!text) return;
    const msg: Message = {
      id: crypto.randomUUID(),
      sender: "me",
      text,
      at: new Date().toISOString(),
      status: "sent",
    };

    setChats((prev: Chat[]) =>
      prev.map((c) =>
        c.id === selectedId ? { ...c, messages: [...c.messages, msg] } : c
      )
    );
    setNewMessage("");
    setIsTyping(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const filtered = useMemo(
    () =>
      chats
        .slice()
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
        .filter((c) => c.name.toLowerCase().includes(query.toLowerCase())),
    [chats, query]
  );

  // Group messages by day
  const groups = useMemo(() => {
    const out: Array<{ day: string; items: Message[] }> = [];
    for (const m of selectedChat.messages) {
      const lbl = dayLabel(m.at);
      const last = out[out.length - 1];
      if (!last || dayLabel(last.items[0].at) !== lbl) out.push({ day: lbl, items: [m] });
      else last.items.push(m);
    }
    return out;
  }, [selectedChat.messages]);

  return (
    <div className="mx-auto flex h-screen max-w-[1400px] bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-96 flex-col border-r border-gray-200/80 bg-white dark:bg-gray-950 dark:border-white/10">
        <div className="flex items-center justify-between p-4">
          <h1 className="text-xl font-semibold">Dingg Chat</h1>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
            Desktop
          </span>
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-blue-500 dark:border-white/10 dark:bg-white/5">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or start new chat"
              className="w-full bg-transparent outline-none placeholder:text-gray-400"
            />
          </div>
        </div>

        <div className="overflow-y-auto">
          {/* Pinned */}
          {filtered.some((c) => c.pinned) && (
            <>
              <div className="px-4 pt-2 pb-1 text-xs uppercase tracking-wide text-gray-400">
                Pinned
              </div>
              {filtered
                .filter((c) => c.pinned)
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5",
                      selectedId === c.id && "bg-blue-50/70 dark:bg-blue-500/10"
                    )}
                  >
                    <div className="relative">
                      {c.avatar ? (
                        <img
                          src={c.avatar}
                          alt={c.name}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <PlaceholderAvatar name={c.name} />
                      )}
                      <OnlineDot online={c.online} />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center justify-between">
                        <p className="truncate font-medium">{c.name}</p>
                        <span className="ml-2 shrink-0 text-xs text-gray-400">
                          {chatTime(c)}
                        </span>
                      </div>
                      <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                        {chatPreview(c)}
                      </p>
                    </div>
                    {c.unread ? (
                      <span className="ml-2 rounded-full bg-blue-500 px-2 py-0.5 text-xs font-semibold text-white">
                        {c.unread}
                      </span>
                    ) : null}
                  </button>
                ))}
            </>
          )}

          {/* All chats */}
          <div className="px-4 pt-4 pb-1 text-xs uppercase tracking-wide text-gray-400">
            Chats
          </div>
          {filtered
            .filter((c) => !c.pinned)
            .map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5",
                  selectedId === c.id && "bg-blue-50/70 dark:bg-blue-500/10"
                )}
              >
                <div className="relative">
                  {c.avatar ? (
                    <img
                      src={c.avatar}
                      alt={c.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <PlaceholderAvatar name={c.name} />
                  )}
                  <OnlineDot online={c.online} />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center justify-between">
                    <p className="truncate font-medium">{c.name}</p>
                    <span className="ml-2 shrink-0 text-xs text-gray-400">
                      {chatTime(c)}
                    </span>
                  </div>
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                    {chatPreview(c)}
                  </p>
                </div>
                {c.unread ? (
                  <span className="ml-2 rounded-full bg-blue-500 px-2 py-0.5 text-xs font-semibold text-white">
                    {c.unread}
                  </span>
                ) : null}
              </button>
            ))}
        </div>
      </aside>

      {/* Conversation */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200/80 bg-white/90 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-gray-950/80">
          <div className="flex items-center gap-3">
            <div className="relative">
              {selectedChat.avatar ? (
                <img
                  src={selectedChat.avatar}
                  alt={selectedChat.name}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <PlaceholderAvatar name={selectedChat.name} />
              )}
              <OnlineDot online={selectedChat.online} />
            </div>
            <div>
              <div className="font-medium">{selectedChat.name}</div>
              <div className="text-xs text-emerald-600 dark:text-emerald-400">
                {selectedChat.online ? "Active now" : "Offline"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
            <IconButton title="Search in conversation">
              <SearchIcon />
            </IconButton>
            <IconButton title="Voice call">
              <PhoneIcon />
            </IconButton>
            <IconButton title="Video call">
              <VideoIcon />
            </IconButton>
            <IconButton title="Conversation info">
              <InfoIcon />
            </IconButton>
          </div>
        </header>

        {/* Messages */}
        <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto bg-gray-100 px-4 py-4 dark:bg-gray-900">
          {groups.map((g) => (
            <div key={g.day}>
              <div className="my-3 flex items-center gap-2">
                <div className="h-px flex-1 bg-gray-300/70 dark:bg-white/10" />
                <span className="text-xs text-gray-500 dark:text-gray-400">{g.day}</span>
                <div className="h-px flex-1 bg-gray-300/70 dark:bg-white/10" />
              </div>
              <div className="space-y-2">
                {g.items.map((m) => (
                  <MessageBubble key={m.id} m={m} />
                ))}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex justify-end">
              <div className="flex items-center gap-2 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 px-3 py-2 text-white shadow">
                <span className="inline-flex gap-1">
                  <span className="block h-1.5 w-1.5 animate-bounce rounded-full bg-white/90 [animation-delay:-.2s]" />
                  <span className="block h-1.5 w-1.5 animate-bounce rounded-full bg-white/90" />
                  <span className="block h-1.5 w-1.5 animate-bounce rounded-full bg-white/90 [animation-delay:.2s]" />
                </span>
                <span className="text-xs opacity-90">Typing…</span>
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-gray-200/80 bg-white p-3 dark:border-white/10 dark:bg-gray-950">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10"
              title="Attach"
            >
              <PaperclipIcon />
            </button>
            <div className="flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <textarea
                ref={textareaRef}
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  setIsTyping(e.target.value.length > 0);
                }}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Aa"
                className="max-h-40 w-full resize-none bg-transparent outline-none placeholder:text-gray-400"
              />
              <div className="mt-1 flex items-center justify-between">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10"
                  title="Emoji"
                >
                  <SmileIcon />
                </button>
                <div className="text-xs text-gray-400">Enter to send • Shift+Enter for newline</div>
              </div>
            </div>
            <button
              onClick={handleSend}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-blue-600 px-4 text-white shadow hover:bg-blue-700 active:scale-[.99]"
              title="Send"
            >
              <SendIcon />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
