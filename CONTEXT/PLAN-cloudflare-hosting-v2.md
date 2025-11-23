# Cloudflare Hosting Plan V2: Phased Rollout

## Context & Goals
- **App:** Vite/React SPA + Cloudflare Pages + Functions.
- **Core Needs:** Secure `GEMINI_API_KEY`, persist generated images (R2), store metadata (D1).
- **Strategy:** Phased rollout to maximize adoption (Free) before introducing friction (Auth) and monetization (Payments).

## Phase 1: Foundation & Open Access (Current Focus)
**Goal:** Launch a free, frictionless experience to attract users.
- **Access:** Public, no login required.
- **Storage:**
    - Images: R2 bucket (`kieran-images`).
    - Metadata: D1 table `generated_images` (stores prompt, R2 key, timestamp).
- **Security:**
    - `GEMINI_API_KEY` stored in Cloudflare Secrets, accessed only via Pages Functions.
    - Rate limiting (WAF or simple IP-based in Functions) to prevent abuse.
- **User Experience:**
    - Users can generate, edit, and upscale.
    - "History" is local-only (localStorage) or session-based for now.
    - Images are public (unlisted) via R2 signed URLs or public bucket with random keys.

### Technical Tasks (Phase 1)
1. **Setup:** Initialize Cloudflare Pages, D1, and R2.
2. **Backend:** Implement `/api/generate`, `/api/edit`, `/api/upscale` in Pages Functions.
3. **Persistence:** Save every generation to R2 and log to D1 `generated_images`.
4. **Frontend:** Update `services/gemini.ts` to call own backend.

## Phase 2: Optional Auth & Personal History
**Goal:** Retain users by offering value (saved history) in exchange for an account.
- **Access:** Optional Login (e.g., "Sign in to save your gallery").
- **Auth Provider:** Auth.js (with GitHub/Google) or simple email magic links, integrated with D1 `users` table.
- **Data Model Updates:**
    - Add `users` table.
    - Add `user_id` (nullable) to `generated_images`.
- **Features:**
    - **Claim History:** When a user signs up, link their recent local session images to their new account.
    - **My Gallery:** View past generations across devices.

## Phase 3: Monetization & Limits
**Goal:** Sustainable growth and revenue.
- **Access:** Free tier limits vs. Paid credits.
- **Logic:**
    - **Anonymous:** Strict daily limit (e.g., 5 images/day).
    - **Free Account:** Higher limit (e.g., 20 images/day).
    - **Paid:** Purchase credits for heavy usage.
- **Integration:** Stripe or LemonSqueezy for payments.
- **Enforcement:** D1 tracks usage counts per `user_id` or IP (for anon).

## Architecture Overview

| Component | Service | Role |
| --- | --- | --- |
| **Frontend** | Cloudflare Pages | Host static assets (Vite build). |
| **API** | Pages Functions | Secure proxy to Gemini; logic for R2/D1. |
| **Images** | R2 Bucket | Cheap object storage for PNGs. |
| **Data** | D1 Database | Relational data: generations, users, credits. |
| **Auth** | TBD (Phase 2) | Manage user sessions. |

## Immediate Next Steps (Phase 1 Execution)
1. [ ] **Scaffold:** `wrangler init` (if not done), setup `wrangler.toml` with R2/D1 bindings.
2. [ ] **DB Schema:** Create `generated_images` table migration.
3. **API:** Port `services/gemini.ts` logic to `functions/api/`.
