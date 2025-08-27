# Dingg — Frontend Spec (Next.js 14 + Tailwind)

> **TL;DR**: Dự án của bạn đang ở **Next.js (App Router) + TypeScript** với cấu trúc `src/`. Ta dùng **Tailwind CSS**, **Zustand** cho state, **Axios** cho HTTP (JWT access + refresh), **Socket.IO client** cho realtime. Lưu lịch sử chat theo **cursor pagination**. Presence/typing/read receipts qua các sự kiện socket.

---

## 1) Stack & thư viện

* **Next.js 14** (App Router, `src/app`) + **TypeScript**
* **Tailwind CSS**
* **Axios** (interceptors: attach token, auto refresh)
* **Zustand** (state: auth, chat, presence)
* **socket.io-client** (realtime)
* **zod** (validate dữ liệu), **dayjs** (thời gian), **@tanstack/react-query** (tuỳ chọn, nếu muốn quản lý cache HTTP)

> Gợi ý thay thế: Redux Toolkit vẫn dùng tốt nếu bạn quen Redux. Bản hướng dẫn dưới đây dùng **Zustand** để khớp thư mục `store/` hiện tại.

---

## 2) Mô tả cấu trúc hiện có (map theo repo của bạn)

```
dingg-frontend/
├─ .next/                      # build output
├─ public/
├─ src/
│  ├─ api/                     # axios instance, API clients
│  ├─ app/                     # Next App Router (routes)
│  │  ├─ (auth)/               # group routes
│  │  │  ├─ login/page.tsx
│  │  │  └─ register/page.tsx
│  │  ├─ chats/
│  │  │  ├─ page.tsx           # danh sách hội thoại
│  │  │  └─ [id]/page.tsx      # khung chat chi tiết
│  │  └─ layout.tsx            # layout gốc
│  ├─ components/              # ChatList, MessageList, ...
│  ├─ context/                 # AuthProvider, SocketProvider
│  ├─ hooks/                   # useSocket, useAuth, useInfiniteScroll, ...
│  ├─ icons/
│  ├─ layout/                  # UI layout/components liên quan bố cục
│  ├─ store/                   # Zustand stores (auth, chat, presence)
│  └─ util/                    # helpers (types, formatters, constants)
├─ next.config.ts
├─ postcss.config.js
├─ tailwind.config.ts          # nếu chưa có, tạo theo mục 3.2
├─ tsconfig.json
├─ package.json
└─ README.md
```

---

## 3) Cài đặt & cấu hình

### 3.1) Cài libs cần thiết

```bash
# Thêm libs cho Dingg
npm i axios socket.io-client zustand zod dayjs
# (tuỳ chọn) query client cho HTTP caching
npm i @tanstack/react-query
# Dev tools
npm i -D @types/node @types/react @types/react-dom
```

### 3.2) Tailwind

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss'
export default <Partial<Config>>({
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/context/**/*.{ts,tsx}',
    './src/layout/**/*.{ts,tsx}',
    './src/store/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#eef6ff',100:'#d8ebff',600:'#2563eb',700:'#1d4ed8' }
      },
      borderRadius: { '2xl': '1rem' }
    }
  },
  plugins: [],
})
```

Trong `src/app/(root)/globals.css` (hoặc nơi bạn import CSS global):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 3.3) Biến môi trường

```
# .env.local
NEXT_PUBLIC_API_BASE=http://localhost:8080
NEXT_PUBLIC_SOCKET_URL=http://localhost:8080
```

---

## 4) Auth (JWT) – kiến trúc đề xuất

* Backend trả **accessToken** (ngắn hạn) và đặt **refresh token** trong **HttpOnly cookie**.
* Frontend giữ access token trong **Zustand (in-memory)** + optional localStorage backup.
* **Axios interceptor** tự động:

  * Gắn `Authorization: Bearer <accessToken>`
  * Khi 401 → gọi `/auth/refresh` (nhờ cookie) → cập nhật token → **retry** request.
* Để bảo vệ route trên server side, backend nên set một cookie flag (ví dụ `dingg_session=1`) khi có refresh token. Middleware của Next chỉ **kiểm tra sự tồn tại** cookie này để cho phép vào trang nội bộ.

### 4.1) Axios instance

`src/api/axios.ts`

```ts
import Axios from 'axios'
import { getAuthStore } from '@/store/auth'

const axios = Axios.create({ baseURL: process.env.NEXT_PUBLIC_API_BASE })

let refreshing = false
let queue: Array<() => void> = []

axios.interceptors.request.use((config) => {
  const token = getAuthStore().getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

axios.interceptors.response.use(
  (res) => res,
  async (err) => {
    const { response, config } = err
    if (response?.status === 401 && !config._retry) {
      config._retry = true
      if (!refreshing) {
        refreshing = true
        try {
          const r = await Axios.post('/auth/refresh', {}, { baseURL: axios.defaults.baseURL, withCredentials: true })
          getAuthStore().getState().setAccessToken(r.data.accessToken)
          queue.forEach((fn) => fn()); queue = []
        } finally { refreshing = false }
      }
      return new Promise((resolve) => { queue.push(() => resolve(axios(config))) })
    }
    return Promise.reject(err)
  }
)

export default axios
```

---

## 5) State management (Zustand)

`src/store/auth.ts`

```ts
import { create } from 'zustand'

interface User { id: string; name: string; avatar?: string }
interface AuthState {
  accessToken: string | null
  user: User | null
  setAccessToken: (t: string | null) => void
  setUser: (u: User | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  setAccessToken: (t) => set({ accessToken: t }),
  setUser: (u) => set({ user: u }),
  logout: () => set({ accessToken: null, user: null }),
}))

// helper để dùng trong file ngoài React (axios)
export const getAuthStore = () => useAuthStore
```

`src/store/chat.ts`

```ts
import { create } from 'zustand'

export type MsgStatus = 'sending'|'sent'|'delivered'|'read'
export interface Message { id: string; conversationId: string; senderId: string; text?: string; createdAt: string; status: MsgStatus }
export interface Participant { id: string; name: string; avatar?: string; online?: boolean }
export interface Conversation { id: string; name?: string; participants: Participant[]; lastMessage?: Message; unreadCount?: number }

interface ChatState {
  conversations: Conversation[]
  messages: Record<string, Message[]>         // convId -> list
  cursors: Record<string, string | null>      // convId -> cursor or null
  typing: Record<string, Set<string>>         // convId -> set(userId)
  upsertConversation: (c: Conversation) => void
  addMessage: (m: Message) => void
  prependMessages: (convId: string, items: Message[]) => void
  setCursor: (convId: string, cursor: string | null) => void
  setTyping: (convId: string, userId: string, isTyping: boolean) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  messages: {},
  cursors: {},
  typing: {},
  upsertConversation: (c) => set((s) => ({
    conversations: [c, ...s.conversations.filter(x => x.id !== c.id)]
  })),
  addMessage: (m) => set((s) => ({
    messages: { ...s.messages, [m.conversationId]: [...(s.messages[m.conversationId]||[]), m] }
  })),
  prependMessages: (id, items) => set((s) => ({
    messages: { ...s.messages, [id]: [...items, ...(s.messages[id]||[])] }
  })),
  setCursor: (id, cursor) => set((s) => ({ cursors: { ...s.cursors, [id]: cursor } })),
  setTyping: (id, userId, isTyping) => set((s) => {
    const setFor = new Set(s.typing[id] || [])
    isTyping ? setFor.add(userId) : setFor.delete(userId)
    return { typing: { ...s.typing, [id]: setFor } }
  }),
}))
```

---

## 6) Socket Provider + hook

`src/context/SocketProvider.tsx`

```tsx
'use client'
import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

const SocketCtx = createContext<Socket | null>(null)
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null)
  const url = process.env.NEXT_PUBLIC_SOCKET_URL!

  useEffect(() => {
    const s = io(url, { transports: ['websocket'], autoConnect: false })
    socketRef.current = s
    s.connect()
    return () => { s.disconnect(); s.close() }
  }, [url])

  const value = useMemo(() => socketRef.current, [])
  return <SocketCtx.Provider value={value}>{children}</SocketCtx.Provider>
}

export const useSocket = () => {
  const s = useContext(SocketCtx)
  if (!s) throw new Error('useSocket must be used within SocketProvider')
  return s
}
```

Tích hợp vào layout gốc: `src/app/layout.tsx`

```tsx
import './globals.css'
import { SocketProvider } from '@/context/SocketProvider'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-white text-gray-900">
        <SocketProvider>
          {children}
        </SocketProvider>
      </body>
    </html>
  )
}
```

---

## 7) Routing & trang chính

### 7.1) `src/app/chats/[id]/page.tsx` (rút gọn)

```tsx
'use client'
import { useEffect } from 'react'
import axios from '@/api/axios'
import { useParams } from 'next/navigation'
import { useChatStore } from '@/store/chat'
import { useSocket } from '@/context/SocketProvider'

export default function ChatDetailPage() {
  const params = useParams(); const convId = params?.id as string
  const s = useSocket(); const chat = useChatStore()

  useEffect(() => {
    if (!convId) return
    s.emit('join:conversation', { conversationId: convId })
    axios.get(`/conversations/${convId}/messages`, { params: { limit: 30 }})
      .then(({ data }) => { /* chat.prependMessages(convId, data.items); chat.setCursor(convId, data.nextCursor || null) */ })

    s.on('message:new', (m: any) => { if (m.conversationId === convId) chat.addMessage(m) })
    s.on('typing', (p: any) => chat.setTyping(convId, p.userId, p.isTyping))

    return () => { s.emit('leave:conversation', { conversationId: convId }); s.off('message:new'); s.off('typing') }
  }, [convId, s])

  return (
    <div className="grid grid-cols-12 h-[100dvh]">
      <aside className="col-span-3 border-r">{/* <ChatList/> */}</aside>
      <section className="col-span-9 flex flex-col">
        {/* <ChatHeader/> */}
        {/* <MessageList conversationId={convId}/> */}
        {/* <MessageInput conversationId={convId}/> */}
      </section>
    </div>
  )
}
```

### 7.2) `MessageInput` (typing + gửi tin)

`src/components/chat/MessageInput.tsx`

```tsx
'use client'
import { useState, useEffect } from 'react'
import axios from '@/api/axios'
import { useSocket } from '@/context/SocketProvider'

export default function MessageInput({ conversationId }: { conversationId: string }) {
  const [text, setText] = useState('')
  const s = useSocket()
  useEffect(() => {
    const handle = setTimeout(() => s.emit('typing', { conversationId, isTyping: false }), 1200)
    return () => clearTimeout(handle)
  }, [text])
  const send = async () => {
    if (!text.trim()) return
    await axios.post(`/conversations/${conversationId}/messages`, { text })
    setText('')
  }
  return (
    <div className="p-3 border-t flex gap-2">
      <input value={text} onChange={e=>{ setText(e.target.value); s.emit('typing',{ conversationId, isTyping:true }) }}
             onKeyDown={e=> e.key==='Enter' && send()}
             placeholder="Nhập tin nhắn..." className="flex-1 rounded-xl border px-3 py-2"/>
      <button onClick={send} className="px-4 py-2 bg-brand-600 text-white rounded-xl">Gửi</button>
    </div>
  )
}
```

### 7.3) `MessageList` (infinite scroll lên trên)

`src/components/chat/MessageList.tsx`

```tsx
'use client'
import { useEffect, useRef } from 'react'
import axios from '@/api/axios'
import { useChatStore } from '@/store/chat'

export default function MessageList({ conversationId }: { conversationId: string }) {
  const chat = useChatStore(); const topRef = useRef<HTMLDivElement | null>(null)

  async function loadMore() {
    const cursor = chat.cursors[conversationId]
    if (cursor === null) return
    const { data } = await axios.get(`/conversations/${conversationId}/messages`, { params: { limit: 30, cursor }})
    // chat.prependMessages(conversationId, data.items)
    // chat.setCursor(conversationId, data.nextCursor ?? null)
  }

  useEffect(() => {
    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMore() })
    if (topRef.current) io.observe(topRef.current)
    return () => io.disconnect()
  }, [])

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      <div ref={topRef} />
      {/* render messages ở đây */}
    </div>
  )
}
```

---

## 8) Middleware bảo vệ route (Next)

File `middleware.ts` ở root:

```ts
import { NextRequest, NextResponse } from 'next/server'

const PROTECTED = ['/chats']
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const needAuth = PROTECTED.some((p) => pathname.startsWith(p))
  if (!needAuth) return NextResponse.next()

  // chỉ cần cookie flag do backend set khi có refreshToken
  const hasSession = Boolean(req.cookies.get('dingg_session')?.value)
  if (!hasSession) {
    const url = req.nextUrl.clone(); url.pathname = '/login'; return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = { matcher: ['/chats/:path*'] }
```

---

## 9) Giao thức Socket đề xuất

* **Rooms**: `join:conversation` với `{ conversationId }` để chỉ nhận event liên quan.
* **Emit**:

  * `typing` → `{ conversationId, isTyping }`
  * `message:read` → `{ conversationId, messageIds: string[] }`
* **On**:

  * `message:new` → cập nhật danh sách & trạng thái gửi/nhận
  * `typing` → cập nhật trạng thái đang gõ
  * `presence` → cập nhật online/offline
  * `message:read` → cập nhật read receipts

> Best practice: Gửi tin bằng **HTTP**; server broadcast `message:new` qua socket để mọi client realtime, đảm bảo idempotency & retry.

---

## 10) API contracts (MVP – phác thảo)

* `POST /auth/register` → `{ id, name, ... }`
* `POST /auth/login` → `{ accessToken }` (+ cookie refresh)
* `POST /auth/refresh` → `{ accessToken }`
* `GET /me` → user hiện tại
* `GET /conversations` → danh sách hội thoại + unreadCount
* `GET /conversations/:id/messages?limit=30&cursor=...` → `{ items, nextCursor }`
* `POST /conversations/:id/messages` → `{ text, attachments? }`
* `POST /conversations/:id/read` → `{ messageIds }`
* `GET /friends` / `POST /friends/:id` / `DELETE /friends/:id`
* `GET /presence?userIds=...` → online states

---

## 11) UI/UX guidelines

* Sidebar (ChatList) / Content (conversation) 2 cột.
* Status dots: xanh (online), xám (offline).
* Typing indicator: "Tên A đang gõ…" ở header hoặc trên input.
* Read receipts: tick đơn (delivered), tick đôi (read).
* Empty states & loading skeletons.
* Tailwind theme `brand`, bo góc `rounded-2xl`, shadow nhẹ.

---

## 12) Scripts khuyến nghị

```jsonc
// package.json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## 13) Lộ trình MVP (Frontend)

1. Trang **Login/Register**, lưu token, axios interceptors.
2. **Chat list** + sidebar + badge unread.
3. **Chat detail**: gửi/nhận HTTP, nhận `message:new` realtime.
4. **Typing indicator** + **presence** (socket events).
5. **Read receipts** + cập nhật `unreadCount`.
6. **Pagination** lịch sử (infinite scroll lên trên).
7. Polish UI: avatar, context menu, copy, enter-to-send, …

---

## 14) Bảo mật & lưu ý

* Refresh token để trong **HttpOnly cookie**; frontend không truy cập trực tiếp.
* Cân nhắc **SameSite=Lax/Strict**, **CSRF** cho các route nhạy cảm nếu dùng cookie khác.
* Escape nội dung hiển thị, whitelist nếu hỗ trợ markdown.

---