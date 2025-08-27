"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FaMagnifyingGlass,
  FaPhone,
  FaVideo,
  FaCircleInfo,
  FaPaperclip,
  FaFaceSmile,
  FaPaperPlane,
} from "react-icons/fa6";

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

// -> make time formatting deterministic across SSR/CSR
const formatTime = (iso: string) => {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false, // fix 24h everywhere
    }).format(d);
  } catch {
    // Fallback (HH:MM) from ISO
    return d.toISOString().slice(11, 16);
  }
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

  const pad = (x: number) => (x < 10 ? `0${x}` : `${x}`);
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());

  if (isSameDay(iso, today.toISOString())) return "Today";
  if (isSameDay(iso, yesterday.toISOString())) return "Yesterday";
  return `${dd}/${mm}/${yyyy}`;
};

/* ---------- Avatars & Icons ---------- */
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
          {/* suppress warning in case server/client locale still differ */}
          <span suppressHydrationWarning>{formatTime(m.at)}</span>
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
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2),
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
            <FaMagnifyingGlass className="h-5 w-5" />
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
                        // eslint-disable-next-line @next/next/no-img-element
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
                        <span
                          className="ml-2 shrink-0 text-xs text-gray-400"
                          suppressHydrationWarning
                        >
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
                    // eslint-disable-next-line @next/next/no-img-element
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
                    <span
                      className="ml-2 shrink-0 text-xs text-gray-400"
                      suppressHydrationWarning
                    >
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
                // eslint-disable-next-line @next/next/no-img-element
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
              <FaMagnifyingGlass className="h-5 w-5" />
            </IconButton>
            <IconButton title="Voice call">
              <FaPhone className="h-5 w-5" />
            </IconButton>
            <IconButton title="Video call">
              <FaVideo className="h-5 w-5" />
            </IconButton>
            <IconButton title="Conversation info">
              <FaCircleInfo className="h-5 w-5" />
            </IconButton>
          </div>
        </header>

        {/* Messages */}
        <div
          ref={listRef}
          className="flex-1 space-y-4 overflow-y-auto bg-gray-100 px-4 py-4 dark:bg-gray-900"
        >
          {groups.map((g) => (
            <div key={g.day}>
              <div className="my-3 flex items-center gap-2">
                <div className="h-px flex-1 bg-gray-300/70 dark:bg-white/10" />
                <span
                  className="text-xs text-gray-500 dark:text-gray-400"
                  suppressHydrationWarning
                >
                  {g.day}
                </span>
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
              <FaPaperclip className="h-5 w-5" />
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
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg:white/10"
                  title="Emoji"
                >
                  <FaFaceSmile className="h-5 w-5" />
                </button>
                <div className="text-xs text-gray-400">
                  Enter to send • Shift+Enter for newline
                </div>
              </div>
            </div>
            <button
              onClick={handleSend}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-blue-600 px-4 text-white shadow hover:bg-blue-700 active:scale-[.99]"
              title="Send"
            >
              <FaPaperPlane className="h-5 w-5" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
