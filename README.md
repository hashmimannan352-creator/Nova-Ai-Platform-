# Nova AI

Your all-in-one AI assistant for chat, coding help, and creative work — with real usage limits, billing, and a personalization layer that adapts to you over time.

## Features

- **Chat** — Groq, Gemini, ChatGPT, Claude, Grok, DeepSeek, and an optional self-hosted local model (Ollama-compatible), with automatic fallback if one provider is down or rate-limited, plus a free Pollinations-based fallback that always works
- **Model routing layer** (`src/aihub/router.js`) — a pure, unit-tested module deciding which provider to try and in what order: honors an explicit user preference, skips unavailable/rate-limited providers, and falls back gracefully instead of failing outright if a preferred provider is temporarily down
- **Victor** — a multi-stage reasoning pipeline (draft → validate → refine) for higher-quality answers on demand
- **Nova Agent** (`/api/agent`) — a real tool-using agent that can run calculations and live web searches, chaining tool calls until it reaches a final answer
- **Victus** — adaptive personalization:
  - **Memory retrieval** (`src/victus/memoryRetrieval.js`) — stored preferences are ranked by relevance to the current message (keyword overlap) instead of dumped in wholesale
  - **Context compression** (`src/victus/contextCompression.js`) — long conversations get their older turns summarized and cached, so token usage stays bounded instead of growing forever; only the last 6 raw messages + a compact summary get sent
  - **Writing style fingerprint** (`src/victus/styleFingerprint.js`) — deterministic analysis of how a user writes (formality, verbosity, emoji use) so replies can mirror their tone
  - **Style model** (`src/victus/styleModel.js`) — a real per-user contextual bandit that learns concise-vs-detailed preference from thumbs up/down via gradient updates
  - **Agent orchestration** (`POST /api/orchestrate`, `src/victus/orchestrator.js`) — a single entrypoint that routes a message to plain chat, Nova Agent, or the coding agent based on real content signals (code present, math, current-info requests)
  - **Cost-aware routing** (`src/aihub/router.js`) — opt-in (`COST_AWARE_ROUTING=true`) heuristic that prefers cheaper providers for simple messages while keeping full quality-first routing for complex ones; an explicit user model choice always overrides it
- **Developer Hub coding agent** (`/api/dev/code`) — 8 modes: explain, fix, review, refactor, docs, generate (write new code from a description), test (generate real unit tests), scaffold (starter project structure)
- **GitHub integration** (`/api/dev/github/file`, `/api/dev/github/tree`) — read-only: fetch a real file's content or a repo's file tree from GitHub's public API, to feed into the coding agent without copy-pasting. No write access (no commits/PRs) — see `src/devhub/github.js` for why that's a deliberate boundary, not a missing feature.
- **Terminal Assistant** (`/api/dev/terminal/explain`) — explains what a shell command does and flags destructive ones (deterministic pattern detection, not just an AI guess) with safer alternatives. Does NOT execute commands — an endpoint that runs arbitrary shell commands is a remote-code-execution vector, not a feature; see `src/devhub/terminalAssistant.js`.
- **Creator Studio — images** (`/api/creator/image`) — free, real, today: logo/poster/product-photo/thumbnail modes, each a specialized prompt template over the same Pollinations pipeline `/api/image` uses (see `src/creator/imagePrompts.js` for the honest scope: prompt engineering, not a dedicated vector logo tool)
- **Creator Studio — upscale & background removal** (`/api/creator/upscale`, `/api/creator/remove-background`) — real integration via Replicate (Real-ESRGAN / rembg), gated behind `REPLICATE_API_TOKEN`, same "slot" pattern as the Claude/Grok providers — genuinely functional once a token is set, honestly reports "not configured" otherwise
- **Creator Studio — video generation** (`/api/creator/video`) — same Replicate-gated pattern, real text-to-video once configured
- **Creator Studio — auto subtitles** (`/api/creator/subtitles`) — real transcription via OpenAI's Whisper API, reusing the existing `OPENAI_API_KEY` (no separate key needed); supports JSON or `.srt` output
- **Creator Studio — honestly out of scope for now**: AI video editing, background removal from actual video, and short-clip generation. These need real video-processing infrastructure (ffmpeg + persistent file storage) that doesn't exist in this app yet — calling those endpoints returns a clear explanation (`501`) rather than a fake result. Not a missing feature so much as a deliberate boundary until that infrastructure is built.
- **Social Media Studio — content generation** (`/api/social/caption`, `/titles`, `/hashtags`, `/reply-suggestions`) — free, real, today: platform-aware captions (real character limits per platform — X's 280 actually matters), titles, hashtags, and comment-reply suggestions. No platform account needed.
- **Social Media Studio — content calendar** (`/api/social/calendar`) — a real planning tool: create/list/update/delete scheduled posts. Honestly a planning tool, not auto-publish — there's no background job worker yet to actually fire these off at their scheduled time (that's Phase 13, Automation).
- **Social Media Studio — account connections** (`/api/social/connections/*`) — genuine, working OAuth 2.0 framework (authorize URL, callback, encrypted token storage) that activates for ANY platform the moment you register a developer app with that platform and set its `SOCIAL_<PLATFORM>_*` env vars. **Not pre-wired to Instagram/YouTube/TikTok/Facebook/X/LinkedIn specifically** — each requires you to register an app with that platform, and most posting-related scopes require that platform's own app review process, which is an external approval step, not something more code can solve. OAuth tokens are encrypted at rest (AES-256-GCM) via `SOCIAL_TOKEN_ENC_KEY` — never stored in plaintext.
- **AI Agents** (`GET /api/agents`, `POST /api/agents/:agentKey`) — 8 specialized personas (Research, Coding, Business, Marketing, Finance, Tutor, Travel, Personal Assistant) sharing one real engine: memory (Victus), streaming (`?stream=true` for real SSE), retries (existing multi-provider fallback), structured logging, and tool-calling scoped honestly per persona — only personas with a real tool (calculator and/or web search) get one; none pretend to book travel, post to social media, or access a CRM that isn't actually connected. See `src/agents/registry.js` for exactly what each persona can and can't do.
- **Dashboard** (`/api/dashboard`) — recent conversations, usage vs. plan limits, billing status, favorite tools, notifications (with a real usage-warning trigger at 80% of your plan limit), and a real 7-day usage chart — all aggregated from actual stored data, nothing faked
- **Auth** — Google OAuth
- **Billing** — Stripe subscriptions with usage-tier gating
- **Conversations** — persisted history, search, titles
- **Structured logging** — every request gets a request ID (`X-Request-Id` header) and JSON log lines for requests, AI provider retries/failures, and billing events — see `src/logging/logger.js`

## Setup

```bash
npm install
cp .env.example .env   # fill in your keys
npm start
```

### Required environment variables

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | Signs session cookies. Required in production — the app refuses to start without it. |
| `DATABASE_URL` | Postgres connection string. Also used for session storage (via `connect-pg-simple`) so logins survive restarts. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth login |
| `GROQ_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` | At least one recommended — chat falls back to a free provider if none are set, but quality/reliability is better with a real key |
| `ANTHROPIC_API_KEY` / `GROK_API_KEY` / `DEEPSEEK_API_KEY` | Optional additional providers — Claude, Grok, DeepSeek |
| `LOCAL_MODEL_URL` / `LOCAL_MODEL_NAME` | Optional — point at a local Ollama server (e.g. `http://localhost:11434`) instead of a hosted API |
| `COST_AWARE_ROUTING` | Optional, default off. Set to `true` to bias toward cheaper providers for simple messages — see `src/aihub/router.js` |
| `GITHUB_TOKEN` | Optional. Without it, GitHub integration works for public repos at 60 requests/hour (GitHub's unauthenticated limit); with it, 5,000/hour and private repo access |
| `REPLICATE_API_TOKEN` | Optional. Enables real image upscaling, background removal, and video generation via Replicate. Without it, those endpoints return a clear "not configured" message rather than a fake result. Get one at replicate.com/account/api-tokens |
| `SOCIAL_TOKEN_ENC_KEY` | Required only if you connect any social platform. 32 random bytes, base64-encoded (`openssl rand -base64 32`) — encrypts stored OAuth tokens at rest. |
| `SOCIAL_<PLATFORM>_CLIENT_ID` / `_CLIENT_SECRET` / `_AUTH_URL` / `_TOKEN_URL` / `_SCOPES` | Optional, per platform (e.g. `SOCIAL_YOUTUBE_CLIENT_ID`). Set these after registering a developer app with that platform to enable real account connections — see `src/social/oauth.js`. |
- **Business Hub — CRM** (`/api/business/customers`) — real customer records: name/email/company/stage/notes, full CRUD, filterable by pipeline stage.
- **Business Hub — invoicing** (`/api/business/invoices`) — real invoice math (cents-based internally to avoid floating-point rounding errors — tested against the classic `0.1 + 0.2` trap) plus a clean, printable HTML invoice (browser print-to-PDF works directly; no binary PDF dependency added). Tracks status (draft/sent/paid/overdue).
- **Business Hub — email writer** (`/api/business/write-email`) — drafts real business emails (cold outreach, follow-ups, invoice reminders, proposals, etc.). Drafts only — this app has no outbound SMTP integration, so nothing gets sent automatically.
- **Business Hub — analytics** (`/api/business/analytics`) — real aggregation from actual CRM/invoice rows: customers by pipeline stage, revenue paid/outstanding/overdue.
- **Business Hub — team workspaces**: intentionally not built here. It's explicitly its own item in Phase 14 (Organisations/Teams/Roles/Permissions/Shared workspaces) — building a partial version now would mean redoing it properly later. Deferred on purpose, not forgotten.
- **Finance Hub** (`/api/finance/*`) — compliance boundary enforced in code, not just prompt wording:
  - **Planners** (`/planners/spending`, `/planners/investment-projection`, `/planners/required-savings`) — pure math (compound interest, the 50/30/20 budgeting rule), no AI call, tested against known reference values.
  - **Learning** (`/learn/:topic`) — only accepts one of 8 fixed asset-class topics (stocks, ETFs, index funds, property, businesses, gold, crypto, lending). **Free-text questions are not accepted at all** — "should I buy X right now" cannot reach this endpoint by construction, not because the AI was told to decline it.
  - **Net worth tracking** (`/net-worth`) and **financial goals** (`/goals`) — real bookkeeping: the user enters their own asset/liability/goal numbers, the app computes totals. No recommendations.
  - Every Finance Hub response includes a `disclaimer` field automatically (`src/finance/disclaimers.js`) — not something that only appears if the AI remembers to say it.
- **Documents** (`/api/documents/*`) — the first real file-upload infrastructure in this app (multer, memory storage, 20MB cap):
  - **Upload + text extraction** — real parsing for PDF (`pdf-parse`), Word (`mammoth`), Excel/CSV (`xlsx`), and PowerPoint (custom OOXML slide-text extraction — real, though it doesn't pull speaker notes/SmartArt, a stated limitation not a silent gap)
  - **RAG / "chat with your documents"** (`/chat`) — genuine retrieval: chunks are embedded (OpenAI, gated on the existing `OPENAI_API_KEY`) and stored, a question retrieves the most relevant chunks by cosine similarity, and the AI is instructed to answer using *only* that retrieved context, with sources returned
  - **Semantic search** (`/search`) — same retrieval mechanism, exposed directly
  - **OCR** (`/ocr`) — deliberately built on a vision-capable AI model rather than a heavy traditional OCR dependency (tesseract.js), reusing the same `OPENAI_API_KEY`
  - **Honest storage note:** only extracted text is persisted, not the original file bytes — no object storage (S3 etc.) is wired up yet to retain raw uploads
  - **Honest math note:** embeddings are stored as JSONB arrays with cosine similarity computed in application code, not via the `pgvector` Postgres extension — works on any standard Postgres (including Railway's default) at the cost of being slower at large scale than a real vector index
- **Productivity** (`/api/productivity/*`) — Calendar, Notes, Projects/Tasks (with real progress %), Goals (with real progress %), Habits (with real streak tracking — current + longest streak, correctly handling gaps, duplicates, and out-of-order entries), and AI Reminders (natural language → structured reminder via AI parsing). Now that Phase 13 adds a real job queue, reminders are one integration away from actually firing — see below.
- **Automation** (`/api/automation/*`) — a real background job queue:
  - **Job queue** (`src/automation/jobQueue.js`) — Postgres-backed (not Redis/BullMQ — see the note in `schema.sql` for why: this app already runs on Postgres for everything else, and `SELECT ... FOR UPDATE SKIP LOCKED` is a real, production-proven way to build a safe concurrent queue on a relational database without adding a second infrastructure service). Polling-based (a few seconds' latency), with real retry-with-backoff on failure.
  - **Workflows** — 2 of the 3 roadmap examples are genuinely implemented end-to-end using capabilities this app already has: **PDF → Extract actions → Calendar** (reads an uploaded document, extracts real dated action items via AI, creates real calendar events) and **Email → Summary → Task** (summarizes pasted email text, creates a real task — manually triggered, since there's no real inbox integration to auto-trigger on new mail). **YouTube → Shorts → Captions → Schedule is explicitly NOT implemented** — it needs both real video-processing infrastructure (declined in Phase 7) and a live YouTube API connection (declined in Phase 8); faking either would be worse than clearly not offering it.
  - **Visual workflow builder:** not built — this project has stayed backend-only throughout (no frontend UI exists for any phase), so "visual" specifically isn't here. The backend workflow/job representation is real and ready for a future UI to call.
- **Team Features** (`/api/teams/*`) — the phase deferred back in Phase 9, now properly built. The riskiest phase so far in one sense: it modifies two *existing* systems (billing tier resolution, Victus memory) rather than only adding new isolated ones — every change there is proven additive with dedicated regression tests (see below).
  - **Organizations, roles, permissions** (`src/teams/permissions.js`) — real RBAC, not just a role label with nothing checking it: Owner/Admin/Member with an explicit per-action allowlist. Specific protections worth naming: an admin can never promote anyone to owner or demote the owner, an admin can never remove another admin (only the owner can), and the owner can never be removed through the member-removal endpoint at all.
  - **Teams** — sub-groups within an organization.
  - **Shared workspaces** — a conversation can be explicitly shared with an organization. Implemented as a separate `conversation_shares` table rather than modifying the `conversations` table itself, so every existing personal-conversation code path is completely untouched.
  - **Shared AI memory** — organization-level preferences (e.g. "our brand voice is casual") are folded into *every* member's Victus context automatically, alongside their personal preferences. For a user in no organization, this is a proven no-op — see the regression tests.
  - **Team billing** — an organization can carry its own subscription that overrides a member's personal one when active. For a user in no organization (or whose org has no active subscription), tier resolution falls through to the exact same personal-subscription lookup that existed before this phase — also covered by regression tests, including confirming the personal-subscription database call isn't even made when team billing is active.
- **Enterprise** (`/api/enterprise/*`) — the final roadmap phase. Usage limits, rate limiting, structured logging, and config validation were already real from earlier phases; this adds what was genuinely still missing:
  - **Security headers** via `helmet` (X-Content-Type-Options, X-Frame-Options, HSTS, etc.). CSP left disabled rather than shipped half-tuned against the existing frontend's inline scripts.
  - **API keys** (`/api/enterprise/api-keys`) — real developer keys (`Authorization: Bearer nova_...`). Only a SHA-256 hash is stored; the raw key is shown once. **A real gap was caught and fixed while building this**: API-key requests initially had no billing tier resolved, meaning `usageGate` would silently treat them as unlimited — fixed by extracting tier resolution into `resolveTierForUser`, shared identically by session and API-key auth. Covered by a dedicated test.
  - **Audit logs** — real, append-only records of sensitive team actions (role changes, member removal, org deletion, API key creation/revocation).
  - **SSO** — real SAML 2.0 (`@node-saml/passport-saml`), gated behind `SAML_ENTRY_POINT`/`SAML_ISSUER`/`SAML_CERT`/`SAML_CALLBACK_URL` — same "slot" pattern as every other optional integration. Not pre-wired to any IdP, since that needs the org's real metadata.
  - **Error reporting** — real, DB-backed error log with an optional Sentry forward (`SENTRY_DSN`). Messages/stacks are sanitized before storage: length-capped, and anything shaped like a Bearer token or API key is redacted.
  - **"Backups"** — honestly scoped like Phase 6's terminal decision: no shelling out to `pg_dump` from an HTTP handler (real attack-surface increase). `/api/enterprise/export` provides a real personal data export as JSON; full-database backups rely on the hosting provider's managed backup service.
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Billing — optional if you're not charging users yet |
| `BASE_URL` | Your public URL, used for OAuth callback and Stripe redirect URLs. Falls back to Railway's public domain if unset. |

The app validates these at startup and prints clear `[OK]` / `[WARN]` / `[ERR]` lines. In production, a missing `SESSION_SECRET` or a malformed critical key (wrong prefix — usually a sign of pasted quotes/whitespace) blocks startup with a clear error instead of failing confusingly on the first real request.

## Testing

```bash
npm test
```

Uses Node's built-in test runner (`node --test`) — no extra dependency needed, works out of the box on Node 18+. Test files live in `test/*.test.js`. 382 tests covering everything above plus (Phase 14): the RBAC permission rules (including the critical owner-protection cases), and — the most important tests in this phase — genuine regression tests proving the modifications to Victus memory and billing tier resolution are exactly no-ops for any user not using team features, plus correctness tests for how they behave for a user who is.

## Architecture

```
src/
 ├── billing/       Stripe checkout, portal, webhook handling
 ├── aihub/         Model routing layer (provider selection logic)
 ├── agents/        Phase 5 persona agents: shared framework, tool registry, persona definitions
 ├── social/        Social Media Studio: content generation, reply assistant, OAuth connection framework, content calendar
 ├── business/      Business Hub: CRM, invoicing (math + HTML render), email writer
 ├── finance/       Finance Hub: planners (pure math), learning (fixed-topic enum), disclaimers, net worth/goals
 ├── documents/     Documents: upload, text extraction (PDF/Word/Excel/PowerPoint), OCR, chunking, embeddings, RAG/semantic search
 ├── productivity/  Calendar, notes, projects/tasks, goals, habits (streak math), AI reminders
 ├── automation/    Real Postgres-backed job queue, workflow definitions and orchestration
 ├── teams/         Organizations, RBAC permissions, teams, shared workspaces/memory, team billing
 ├── enterprise/    API keys, audit logs, error reporting, SSO (SAML slot), data export
 ├── config/        Pricing tiers
 ├── conversations/ Conversation CRUD + title generation
 ├── dashboard/     Dashboard aggregation, favorite tools, notifications
 ├── db/            Postgres access layer (parameterized queries throughout)
 ├── devhub/        Developer Hub coding agent
 ├── logging/       Structured JSON logging + request ID middleware
 ├── middleware/     Usage gating, auth attachment
 ├── victus/        Adaptive personalization (memory + real ML style model)
 └── index.js       App entrypoint, routes, AI provider orchestration
```

## Known limitations (being worked on)

- No automated tests yet for most modules besides logging — being added incrementally
- No CI/CD pipeline yet
- Coding agent uses LLM reasoning, not a real static analyzer/linter — good for explanation and general review, not a substitute for ESLint/etc. on your actual codebase
