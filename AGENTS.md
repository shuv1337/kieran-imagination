# Kieran's Imagination - AI Agent Guide

## Project Overview

Kieran's Imagination is an AI-powered coloring page and trading-card creator for kids. Children start creating immediately; work is saved automatically in **My creations** without a project or World setup step. Durable **Creation Jobs** and structured **Card Documents** sit behind that simple flow. Public Hot or Not remains available without login.

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
│   ├── Editor.tsx       # Canvas editor with durable Save Art
│   └── HotOrNot.tsx     # Public voting (/hot)
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
| `DB` | D1 | kieran-db | Jobs, worlds, cards, legacy hot |
| `IMAGES` | Images | - | Normalize / transform |
| `CREATION_WORKFLOW` | Workflow | kieran-creation | Durable job execution |
| `APP_RATE_LIMITER` | Rate limit | - | Login + job submission |

## Key Features

1. **Household login** - shared family access code cookie
2. **Automatic persistence** - invisible internal collections, with artworks and revisions shown as My creations
3. **Creation Engine** - one path for coloring generate/edit/enhance, card art, text ops
4. **Creation Jobs** - idempotent, credit-reserved, Workflow-backed
5. **Media Assets** - normalized R2 masters/previews (no base64 API)
6. **Trading Card Documents** - structured fields + single CardRenderer
7. **Hot or Not** - public legacy `generated_images` only (private world assets excluded)

## API (new)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/login` | POST | no | Exchange access code for session cookie |
| `/api/session` | GET | no | Session probe |
| `/api/uploads` | POST | yes | Multipart image → normalized assetId |
| `/api/jobs` | POST | yes | Accept CreationRequest (+ Idempotency-Key) |
| `/api/jobs/:id` | GET | yes | Job status |
| `/api/assets/:id` | GET | private assets need cookie | Stream media |
| `/api/worlds` | GET/POST | yes | Internal saved-creation collections; never a required UX step |
| `/api/artworks/:id` | GET | yes | Artwork + revisions |
| `/api/cards/:id` | GET/PATCH | yes | Card document |
| `/api/hot` | GET/POST | no | Public voting |
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
