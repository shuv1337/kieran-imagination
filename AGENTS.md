# Kieran's Imagination - AI Agent Guide

## Project Overview

Kieran's Imagination is an AI-powered coloring page generator built for kids. Users can describe any idea (e.g., "a dinosaur playing guitar") and the app generates a printable black-and-white coloring page using Google's Gemini AI.

**Live site:** https://kieran.app

## Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS, Framer Motion
- **Backend:** Cloudflare Pages Functions (serverless)
- **AI:** Google Gemini API for image generation
- **Storage:** Cloudflare R2 (images), Cloudflare D1 (SQLite database)
- **Package Manager:** Bun

## Project Structure

```
├── components/          # React components
│   ├── Generator.tsx    # Main prompt input and image generation UI
│   ├── Preview.tsx      # Generated image display with share/download
│   ├── Editor.tsx       # Image coloring editor
│   ├── HotOrNot.tsx     # Community voting feature (/hot route)
│   └── ...
├── functions/           # Cloudflare Pages Functions (API routes)
│   ├── api/
│   │   ├── generate.ts      # POST /api/generate - Generate coloring page
│   │   ├── edit.ts          # POST /api/edit - AI edit existing image
│   │   ├── upscale.ts       # POST /api/upscale - Upscale image
│   │   ├── images.ts        # POST /api/images - Upload/save image
│   │   ├── images/view.ts   # GET /api/images/view?key= - Serve image from R2
│   │   ├── suggestions.ts   # GET /api/suggestions - Get prompt suggestions
│   │   ├── improve-prompt.ts # POST /api/improve-prompt - Enhance user prompt
│   │   └── hot.ts           # Hot or Not voting endpoints
│   ├── utils.ts         # Shared utilities (rate limiting, R2/D1 helpers)
│   └── _middleware.ts   # Request middleware (meta tags for /hot route)
├── services/            # Frontend service modules
│   ├── gemini.ts        # API client for Gemini endpoints
│   └── storage.ts       # Image persistence helpers
├── migrations/          # D1 database migrations
├── App.tsx              # Main app component with routing
└── wrangler.toml        # Cloudflare configuration
```

## Development

### Prerequisites
- Bun v1.3.3+
- Wrangler CLI (included in devDependencies)

### Local Development

```bash
# Install dependencies
bun install

# Run dev server (requires GEMINI_API_KEY in .env.local)
bun run dev

# Run tests
bun run test

# Build for production
bun run build
```

### Environment Variables

Create `.env.local` with:
```
GEMINI_API_KEY=your_api_key_here
```

## Deployment

The app is deployed to **Cloudflare Pages** with automatic deployments on push to `main`.

### Check Deployment Status

```bash
# List recent deployments
npx wrangler pages deployment list --project-name kieran-app

# View deployment details (shows commit, status, URLs)
npx wrangler pages deployment list --project-name kieran-app | head -20
```

### Manual Deployment (if needed)

```bash
# Build and deploy
bun run build
npx wrangler pages deploy dist --project-name kieran-app
```

### Cloudflare Resources

The app uses these Cloudflare bindings (configured in `wrangler.toml`):

| Binding | Type | Name | Purpose |
|---------|------|------|---------|
| `IMAGES_BUCKET` | R2 | kieran-images | Store generated images |
| `DB` | D1 | kieran-db | Store metadata, votes, logs |
| `IMAGES` | Images | - | Image transformations |

### Database Migrations

```bash
# Run migrations on local dev DB
npx wrangler d1 migrations apply kieran-db --local

# Run migrations on production
npx wrangler d1 migrations apply kieran-db --remote
```

## Key Features

1. **Image Generation** - Type a prompt, get a coloring page
2. **Photo to Coloring Page** - Upload/paste a photo to convert
3. **AI Enhancement** - "Enhance Details" adds more line art
4. **Fix Coloring** - "Fix Coloring" removes pre-colored areas
5. **Prompt Improvement** - AI enhances user prompts for better results
6. **Suggestions** - AI-generated prompt ideas
7. **Share** - Native share via Web Share API (works great on mobile)
8. **Hot or Not** - Community voting on generated images (/hot route)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/generate` | POST | Generate coloring page from prompt |
| `/api/edit` | POST | AI edit an existing image |
| `/api/upscale` | POST | Upscale image resolution |
| `/api/images` | POST | Save image to R2 |
| `/api/images/view` | GET | Retrieve image from R2 |
| `/api/suggestions` | GET | Get prompt suggestions |
| `/api/improve-prompt` | POST | Enhance a user's prompt |
| `/api/hot` | GET/POST | Hot or Not voting |

## Common Tasks

### Adding a new API endpoint

1. Create file in `functions/api/your-endpoint.ts`
2. Export `onRequestGet`, `onRequestPost`, etc.
3. Use utilities from `functions/utils.ts` for consistency

### Modifying the database schema

1. Create new migration in `migrations/` (increment number prefix)
2. Test locally: `npx wrangler d1 migrations apply kieran-db --local`
3. Deploy to prod: `npx wrangler d1 migrations apply kieran-db --remote`

### Debugging production issues

```bash
# Tail production logs
npx wrangler pages deployment tail --project-name kieran-app

# Query D1 database
npx wrangler d1 execute kieran-db --remote --command "SELECT * FROM request_logs ORDER BY timestamp DESC LIMIT 10"
```
