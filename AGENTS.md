# Kieran's Imagination - AI Agent Guide

## Project Overview

Kieran's Imagination is an AI-powered coloring page and trading-card creator for kids. Children start creating immediately; work is saved automatically in **My creations** without a project or World setup step. Durable **Creation Jobs** and structured **Card Documents** sit behind that simple flow.

**Live site:** https://kieran.app

## Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS, Framer Motion, React Router
- **Backend:** Cloudflare Worker (Static Assets + Workflows) — not Pages Functions
- **AI:** Google Gemini via a single adapter (`server/creation/google.ts`); production image work uses only `gemini-3.1-flash-lite-image` at 1K
- **Storage:** Cloudflare R2 (media), Cloudflare D1 (jobs, worlds, cards), Cloudflare Images (normalize)
- **Package Manager:** Bun

## Project Structure

```
├── shared/              # Shared contracts (creation, jobs, worlds, cards)
├── server/
│   ├── creation/        # Creation Engine, profiles, prompts, google + fake adapters
│   ├── media/           # Normalization + media repository
│   ├── worlds/          # Worlds repository
│   └── cards/           # Card documents repository
├── worker/              # Worker entry, router, auth, jobs, uploads, Workflow
├── services/            # Frontend API clients (api, jobs, worlds, cards)
├── components/
│   ├── CreatorHome.tsx  # prompt-first home; automatic persistence
│   ├── CreationsLibrary.tsx # My creations
│   ├── worlds/          # internal artwork/revision view (legacy folder name)
│   ├── cards/           # CardDocumentEditor + CardRenderer
│   └── Editor.tsx       # Canvas editor with durable Save Art
├── migrations/          # D1 migrations (through 0007_creation_platform.sql)
├── tests/worker/        # Unit/contract tests
├── App.tsx              # React Router shell
└── wrangler.toml        # Worker + bindings configuration
```

## Development

```bash
bun install
bun run build
bun run dev              # build SPA then wrangler dev
bun run check            # tsc + tests + build
bun run db:migrate:local
```

### Secrets (Worker)

```text
GEMINI_API_KEY
FAMILY_ACCESS_CODE
SESSION_SIGNING_KEY
```

`GEMINI_API_KEY` is **never** exposed to the Vite client.

### Cloudflare Resources

| Binding | Type | Name | Purpose |
|---------|------|------|---------|
| `ASSETS` | Assets | dist/ | SPA static files |
| `IMAGES_BUCKET` | R2 | kieran-images | Media bytes |
| `DB` | D1 | kieran-db | Jobs, worlds, cards, legacy tables |
| `IMAGES` | Images | - | Normalize / transform |
| `CREATION_WORKFLOW` | Workflow | kieran-creation | Durable job execution |
| `APP_RATE_LIMITER` | Rate limit | - | Login + job submission |

## Key Features

1. **Household login** - shared family access code cookie; optional for creation
2. **Guest identity** - anonymous browsers get a per-browser guest owner (`X-Kieran-Guest-Id` header from the client, mirrored into the HttpOnly `kieran_guest_id` cookie so `<img>`/download requests can read private assets)
3. **Automatic persistence** - invisible internal collections, with artworks and revisions shown as My creations
4. **Creation Engine** - one path for coloring generate/edit/enhance, card art, text ops
5. **Creation Jobs** - idempotent, credit-reserved, Workflow-backed
6. **Media Assets** - normalized R2 masters/previews (no base64 API)
7. **Trading Card Documents** - structured fields + single CardRenderer

## API (new)

"optional" = household session if present, otherwise the guest owner.

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/login` | POST | no | Exchange access code for session cookie |
| `/api/session` | GET | no | Session probe |
| `/api/uploads` | POST | optional | Multipart image → normalized assetId |
| `/api/jobs` | POST | optional | Accept CreationRequest (+ Idempotency-Key) |
| `/api/jobs/:id` | GET | optional | Job status |
| `/api/assets/:id` | GET | owner (session or guest cookie) | Stream media |
| `/api/worlds` | GET/POST | optional | Internal saved-creation collections; never a required UX step |
| `/api/artworks/:id` | GET | optional | Artwork + revisions |
| `/api/cards/:id` | GET/PATCH | optional | Card document |
| `/api/suggestions` | GET | no | Prompt suggestions |

## Deployment

```bash
bun run build
npx wrangler deploy
# secrets:
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put FAMILY_ACCESS_CODE
npx wrangler secret put SESSION_SIGNING_KEY
npx wrangler d1 migrations apply kieran-db --remote
```

Do not maintain Pages Functions creation APIs in parallel.

Do not expose Worlds, project creation, or model/quality selection in the child-facing flow. Do not add larger image models to the production catalog; experiments belong behind an explicit dev/admin-only boundary.

Preserve the classic visual identity from commit `015818d` and `assets/kieran-app-home.png`: large illustrated branding, comic display type, glowing prompt surface, colorful gradient actions, and a spacious creation-first layout. Fit new capabilities into that visual language instead of replacing it with a conventional app shell or dashboard.
