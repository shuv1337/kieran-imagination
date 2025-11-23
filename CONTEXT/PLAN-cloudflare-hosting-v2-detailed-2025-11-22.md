# Cloudflare Hosting Plan V2: Detailed Phased Rollout
**Date:** 2025-11-22
**Status:** Draft
**Related Issue:** N/A (Derived from internal planning)

## 1. Context & Goals

The primary objective is to migrate the current client-side AI generation logic to a secure, server-side architecture using Cloudflare Pages Functions. This allows us to secure the `GEMINI_API_KEY`, persist generated images for a "History" feature, and prepare for future authentication and monetization.

### Core Goals (Phase 1)
- **Security:** Move `GEMINI_API_KEY` to Cloudflare Secrets; remove from client bundle.
- **Persistence:** Save all generated images to Cloudflare R2 and metadata to Cloudflare D1.
- **Zero Friction:** Maintain the current "no login required" experience for the initial launch.

## 2. Technical Architecture

### Components
| Component | Technology | Responsibility |
| :--- | :--- | :--- |
| **Frontend** | React + Vite | User Interface, State Management (modified to call API). |
| **Backend API** | Cloudflare Pages Functions | Proxies Gemini API, handles R2 upload/D1 logging. |
| **Image Storage** | Cloudflare R2 | Stores generated PNGs cheaply (`kieran-images` bucket). |
| **Metadata DB** | Cloudflare D1 | Relational database for generation logs (`kieran-db`). |
| **AI Provider** | Google Gemini API | `gemini-3-pro-image-preview` model. |

### Data Flow
1. **User Request:** Frontend sends Prompt + Options to `/api/generate`.
2. **Backend Processing:**
   - Validates input.
   - Calls Gemini API (`GEMINI_API_KEY` injected via Env).
   - Receives Base64 image.
3. **Persistence:**
   - Backend uploads image to R2 (`generated/YYYY-MM-DD/uuid.png`).
   - Backend saves metadata to D1 (`generated_images` table).
4. **Response:** Backend returns a browser-usable image URL (public R2 URL or proxy) plus the R2 key; Base64 may be included only for immediate display during Phase 1.

## 3. Data Models

### D1 Schema (`migrations/0001_initial_schema.sql`)
```sql
CREATE TABLE generated_images (
  id TEXT PRIMARY KEY,       -- UUID
  file_name TEXT NOT NULL,   -- {uuid}.png
  prompt TEXT NOT NULL,      -- Original prompt
  r2_key TEXT NOT NULL,      -- generated/YYYY-MM-DD/{uuid}.png
  created_at INTEGER NOT NULL,-- Timestamp
  source TEXT NOT NULL,      -- 'generate', 'edit', 'upscale'
  metadata TEXT              -- JSON string for future extensibility
);
```
- **Metadata contents (Phase 1):** store original client filename (if provided), prompt hash, request source, and optional client hints to support future history/audit.

### R2 Structure
- Bucket: `kieran-images`
- Path: `generated/{YYYY-MM-DD}/{UUID}.png`
- Access: Public Read (via custom domain or R2.dev subdomain) for easy sharing/viewing.

## 4. Implementation Tasks (Phase 1)

### 4.1. Infrastructure & Configuration
- [x] **Wrangler Config:** Set a current `compatibility_date` (2025-11-23 applied) and replace the placeholder `database_id` with the real D1 ID once created; verify `pages` bundling succeeds.
- [x] **Secrets:** Set `GEMINI_API_KEY` in Cloudflare.
  ```bash
  npx wrangler pages secret put GEMINI_API_KEY
  ```
- [x] **R2 Bucket:** Create the bucket and enable public access (or configure custom domain).
  ```bash
  npx wrangler r2 bucket create kieran-images
  # Enable public access via dashboard or wrangler if custom domain used
  ```
- [x] **D1 Database:** Create and migrate.
  ```bash
  npx wrangler d1 create kieran-db
  npx wrangler d1 execute kieran-db --file=migrations/0001_initial_schema.sql --remote
  ```

### 4.2. Backend Implementation (`functions/`)
- [x] **Scaffold:** `api/generate.ts`, `api/edit.ts`, `api/upscale.ts` created.
- [x] **Public URL Strategy:** Decide and implement now. Phase 1 recommendation: enable R2.dev/public access and return the full URL from all endpoints; if private, expose a GET proxy (e.g., `/api/images/view?key=...`) and return that URL.
- [x] **Refine Utils:** Update `functions/utils.ts` to emit the chosen public URL (or proxy URL) instead of just the R2 key; ensure `/api/images` returns the same shape.
  - *Current State:* Returns `key` and `/api/images` forwards that key as `url` (not renderable).
- [ ] **Gemini SDK Compatibility:** Confirm `@google/genai` bundles/runs on Cloudflare Pages; if not, swap to fetch-based calls before implementation (pending wrangler build check).
- [x] **Error Handling:** Ensure generic error messages for client, detailed logs for server.
- [x] **CORS:** Cloudflare Pages Functions handle same-origin requests automatically. No CORS needed if hosted on same domain.

### 4.3. Frontend Integration (`services/gemini.ts`)
- [x] **API Client:** `services/gemini.ts` already points to `/api/*`.
- [x] **Testing:** Verify the `GeneratedImage` interface matches the API response.
  ```typescript
  export interface GeneratedImage {
    url: string; // public/proxy URL for persisted image
    key: string; // R2 key for reference/history
    previewUrl?: string; // optional base64 preview for immediate render
  }
  ```

### 4.4. Validation & Deployment
- [ ] **Local Dev:** Run full stack locally (pending live resource smoke test).
  ```bash
  npx wrangler pages dev . --d1 DB=kieran-db --r2 IMAGES_BUCKET=kieran-images --binding GEMINI_API_KEY=...
  ```
- [x] **Deploy:**
  ```bash
  npx wrangler pages deploy .
  ```
- [ ] **Verification:**
  1. Generate an image -> Check R2 bucket for file.
  2. Check D1 table for row.
  3. Check Frontend displays image.

### 4.5. Safety, Limits, and Observability
- [x] **Payload Limits:** Enforce max prompt length and Base64 size on all endpoints; reject oversize requests with 413.
- [x] **Streaming/URL Responses:** Prefer returning URLs over full Base64 bodies to reduce payload size once public URL strategy is set.
- [x] **Write Consistency:** If D1 insert fails after R2 upload, delete the R2 object (or wrap in a best-effort compensation step).
- [x] **Rate Limiting/Abuse Controls:** Add basic throttling per IP/session for Gemini calls and storage writes; log rejected attempts.
- [x] **Structured Logging:** Emit structured server-side logs (without leaking secrets) and return generic client errors.

## 5. External References & Resources

- **Cloudflare Pages Functions:** [Documentation](https://developers.cloudflare.com/pages/functions/)
- **Cloudflare D1:** [Documentation](https://developers.cloudflare.com/d1/)
- **Cloudflare R2:** [Documentation](https://developers.cloudflare.com/r2/)
- **Google Gemini API:** [Docs](https://ai.google.dev/docs)

## 6. Future Phases (Preview)

### Phase 2: Auth & History
- Implement Auth.js or simple Magic Link.
- Add `users` table to D1.
- Create `/api/user/history` endpoint to fetch images by `user_id`.

### Phase 3: Monetization
- Add `credits` table.
- Integrate Stripe/LemonSqueezy webhook.
- Enforce limits in `functions/api/middleware.ts`.
