# Kieran's Imagination: One-Shot Creation Platform Refresh

Status: implemented on the feature branch; awaiting deployment

Created: 2026-07-11

Delivery shape: one branch, one consolidated migration, one Worker deployment, one client cutover

## Outcome

Replace the current app in one coordinated release:

- Five duplicated image-generation handlers become one Creation Engine.
- Synchronous requests become durable Creation Jobs with simple daily credits and normalized media.
- Temporary generate/preview/editor state becomes automatically saved creations with artwork history.
- Trading Cards become structured documents rendered deterministically around generated art.
- Retired and preview Gemini image models are replaced by one cheap stable Flash Lite route.

This is intentionally optimized for a tiny, parent-operated audience. It does not build a general account platform, parallel runtime, compatibility layer, canary system, or long migration program.

## One-shot rules

- Build everything on one feature branch and deploy it together.
- Move Pages to one Cloudflare Worker with Static Assets and Workflows.
- Add one new schema migration, <code>0007_creation_platform.sql</code>, containing the complete target schema.
- Apply the already-checked-in <code>0006_trading_cards.sql</code> first; do not edit migration history.
- Replace the old frontend service and five old provider implementations in the same release.
- Do not maintain old and new creation APIs in parallel.
- Do not add feature flags, percentage rollouts, shadow traffic, pairing codes, multi-tenant accounts, budget ledgers, or provider plug-in infrastructure beyond one clean adapter seam.
- Keep one emergency escape hatch during the smoke only: disable the new Worker route so the recorded Pages deployment is exposed again.
- Treat the owner's Google API approval as settled. No terms or age-gate work is part of this plan.

## Current code being replaced

The five duplicated provider pipelines are:

- <code>functions/api/generate.ts:52-241</code>
- <code>functions/api/edit.ts:52-217</code>
- <code>functions/api/upscale.ts:52-205</code>
- <code>functions/api/cards/generate.ts:67-287</code>
- <code>functions/api/cards/edit.ts:59-246</code>

Other concrete pressure:

- <code>functions/utils.ts:82</code> defaults to a retired preview image model.
- <code>functions/api/improve-prompt.ts:41</code> and <code>functions/api/suggestions-seed.ts:44</code> use retired <code>gemini-2.0-flash</code>.
- <code>functions/utils.ts:89-93</code> uses an isolate-local Map for limits.
- The API accepts 50 MiB base64 while the Cloudflare Images binding accepts at most 20 MB.
- <code>App.tsx:15-24</code> owns the active creation only in memory.
- Editor output cannot become a saved artwork revision.
- Card generation asks for art without text, while card editing later assumes text exists in the pixels.
- Card preview, export, theme, and rarity components are only partially connected.

Baseline on clean <code>main</code> at <code>015818d</code>:

~~~text
bunx tsc --noEmit  -> pass
bun run test       -> 2 files, 8 tests pass
bun run build      -> pass
~~~

## Target shape

~~~text
React routes
  |
  +-- /, /creations, /artworks/:id, and /cards
  |
  +-- POST /api/uploads -------------> R2 original
  |
  +-- POST /api/jobs ----------------> D1 job + daily credit reservation
           |
           +--------------------------> Cloudflare Workflow
                                           |
                                           +-- load normalized input
                                           +-- Creation Engine
                                           |     +-- Google adapter
                                           +-- normalize output
                                           +-- persist media + revision
                                           +-- settle credits + job

D1: jobs, daily credits, media metadata, internal collections, artwork revisions, card documents
R2: immutable original, normalized input, raw provider output, master, preview, print
~~~

There is one provider integration point and one Google SDK import. Workflows own durable step execution; D1 owns application state; R2 owns image bytes.

## Source layout

~~~text
shared/
  creation.ts
  jobs.ts
  worlds.ts
  cards.ts

server/
  creation/
    engine.ts
    models.ts
    profiles.ts
    errors.ts
    prompts.ts
    google.ts
    fake.ts
  media/
    normalize.ts
    repository.ts
  worlds/
    repository.ts
  cards/
    repository.ts

worker/
  index.ts
  env.ts
  router.ts
  auth.ts
  jobs.ts
  uploads.ts
  worlds.ts
  cards.ts
  CreationWorkflow.ts

services/
  api.ts
  jobs.ts
  worlds.ts
  cards.ts

components/
  CreatorHome.tsx
  CreationsLibrary.tsx
  worlds/ArtworkView.tsx
components/cards/
migrations/0007_creation_platform.sql
tests/worker/
tests/e2e/
~~~

Delete the old route-level Google clients and <code>services/gemini.ts</code> during cutover. Do not leave compatibility facades behind.

## 1. Creation Engine

The browser submits intent, not model IDs or provider options.

~~~ts
type CreationOperation =
  | 'coloring.generate'
  | 'coloring.edit'
  | 'coloring.enhance'
  | 'card-art.generate'
  | 'card-art.edit'
  | 'card-copy.suggest'
  | 'prompt.improve'
  | 'suggestions.generate';

type CreationQuality = 'draft' | 'standard' | 'print' | 'premium';

interface CreationInput {
  assetId: string;
  role: 'base' | 'character' | 'style' | 'mask';
  position: number;
}

interface CreationRequest {
  operation: CreationOperation;
  quality: CreationQuality;
  prompt?: string;
  instruction?: string;
  inputs: CreationInput[];
  worldId?: string;
  artworkId?: string;
  parentRevisionId?: string;
}
~~~

The Engine:

1. Validates the operation and inputs.
2. Resolves a versioned profile and model route.
3. Builds a versioned prompt.
4. Calls the Google adapter once.
5. Maps output or failure into stable application types.
6. Returns bytes plus provenance to the Workflow.

The Workflow, not the Engine, owns retries, Job state, media persistence, budget settlement, and artwork commits.

Keep the adapter narrow:

~~~ts
interface ModelAdapter {
  generateImage(request: ProviderImageRequest): Promise<ProviderImageResult>;
  generateObject<T>(request: ProviderObjectRequest<T>): Promise<ProviderObjectResult<T>>;
}
~~~

Only <code>server/creation/google.ts</code> imports <code>@google/genai</code>. The fake adapter implements the same interface for tests.

Stable failure categories:

~~~text
invalid_input
filtered
rate_limited
provider_unavailable
timeout
no_output
normalization_failed
budget_exceeded
cancelled
internal
~~~

Retry only a definite pre-response network failure, 429, or 5xx, with at most two total provider attempts. Treat a post-send timeout as ambiguous: charge the reserved attempt and stop for an explicit user retry instead of risking an invisible duplicate charge. Never retry invalid input, filtering, auth/configuration, budget failure, or cancellation. Any semantic repair consumes the second and final attempt; it cannot create a third billable call.

## 2. Model runway

Keep the catalog in versioned TypeScript, not in D1.

| Internal route | Production model | Output | Use |
|---|---|---:|---|
| Draft | <code>gemini-3.1-flash-lite-image</code> | 1K | fast creation |
| Standard | <code>gemini-3.1-flash-lite-image</code> | 1K | normal create/edit |
| Print | <code>gemini-3.1-flash-lite-image</code> | 1K | compatibility alias; no larger-model upgrade |
| Premium | <code>gemini-3.1-flash-lite-image</code> | 1K | compatibility alias; no larger-model upgrade |
| Text fast | <code>gemini-3.1-flash-lite</code> | structured text | prompts and suggestions |

There is no production image fallback chain and no larger image model in the catalog. Any future alternative-model experiment must be an explicit dev/admin-only opt-in outside the normal CreationRequest quality choices.

Use the Interactions API for image work, request image-only output, default one-shot work to <code>store:false</code>, and persist all authoritative assets locally. A provider interaction ID is optional provenance, never the database key for a World.

Creation profiles:

- <code>coloring-generate.v1</code>: clean black line art on white, 3:4.
- <code>coloring-edit.v1</code>: preserve composition while applying an instruction.
- <code>coloring-enhance.v1</code>: add printable line detail; replaces the misleading upscale pipeline.
- <code>card-art-generate.v1</code>: 2:3 art only, no border or words.
- <code>card-art-edit.v1</code>: art-only revision.
- <code>card-copy-suggest.v1</code>: validated structured move/copy suggestions.
- <code>prompt-improve.v1</code>: one improved prompt as validated JSON.
- <code>suggestions-generate.v1</code>: validated suggestion records for the existing suggestion store.

## 3. Durable Jobs and simple budgets

### API

<code>POST /api/uploads</code>

- Accept multipart PNG, JPEG, or WebP through the Worker.
- Cap input at 10 MiB so it remains comfortably below the Images limit.
- Write an immutable <code>upload_original</code>, validate decoded type/dimensions, create one <code>input_normalized</code> asset, and return that normalized <code>assetId</code>.
- Jobs consume the normalized input directly; they do not transform the same upload twice.
- This deliberately avoids presigned URLs, browser CORS, S3 credentials, and upload-finalization state.

<code>POST /api/jobs</code>

- Requires an <code>Idempotency-Key</code>.
- Accepts <code>CreationRequest</code> with asset IDs, never base64.
- Atomically creates the Job and reserves credits.
- Starts <code>CreationWorkflow</code> with only <code>{ jobId }</code>.
- Returns <code>202 { jobId }</code>.

<code>GET /api/jobs/:jobId</code>

- Returns status, stage, result asset/revision or validated <code>result_json</code>, sanitized error, and timestamps.
- The frontend polls while active and reloads active Jobs when a World route opens.

<code>GET /api/jobs?worldId=:worldId&amp;active=true</code>

- Returns queued/running Jobs and recent terminal results needed to restore a World after refresh.

<code>POST /api/jobs/:jobId/cancel</code>

- Marks cancellation requested; the Workflow checks between steps and releases unused credits.

<code>GET /api/assets/:assetId</code>

- Requires the household cookie for private assets and streams R2 with the stored MIME type, <code>ETag</code>, range, and cache headers.

Job status stays small:

~~~text
queued -> running -> succeeded
                  -> failed
                  -> cancelled
~~~

Job stage:

~~~text
input -> model -> normalize -> save
~~~

### Idempotency

- Add <code>UNIQUE(owner_id, idempotency_key)</code>.
- The same key and request hash returns the existing Job.
- The same key with different input returns 409.
- Use the Job ID as the Workflow instance ID.
- Use deterministic R2 keys by Job and attempt.
- Before a retry calls Google, check whether raw output for that attempt already exists.

One tiny scheduled repair runs every five minutes. It may idempotently create a missing Workflow only for a queued Job whose Workflow instance is absent. It must inspect Workflow/attempt state before changing anything and must never release a running or ambiguous provider attempt merely because it is old. This is the only reconciliation loop.

### Daily credits

Do not build monetary accounts, ledgers, policy tables, or subscription logic.

Use one row per owner/day:

~~~text
daily_budgets(owner_id, day, credit_limit, reserved, used)
~~~

Assign fixed integer credits per provider attempt in code:

| Route | Credits |
|---|---:|
| Structured text | 1 |
| Draft | 1 |
| Standard | 1 |
| Print | 1 |
| Premium | 1 |

Job acceptance first creates today's household row with <code>INSERT OR IGNORE</code> using the configured <code>DAILY_CREDIT_LIMIT</code>. The Job insert and maximum two-attempt reservation then happen in one D1 batch, with a migration trigger aborting the insert if the limit would be exceeded:

~~~sql
INSERT INTO creation_jobs (..., reserved_credits, budget_state)
VALUES (..., :attempt_credits * :max_attempts, 'reserved');
-- BEFORE/AFTER INSERT triggers reject over-limit work and increment daily reserved.
~~~

If the trigger aborts, return 429 with the next reset. Settle by conditionally moving the Job once from <code>reserved</code> to <code>settled</code>; an update trigger moves actual/ambiguous attempt credits to used and releases the remainder. Workflow replay cannot settle the same Job twice. On a known no-charge failure, release that attempt; on an ambiguous post-request failure, charge it conservatively.

This is durable enough to stop accidental runaway spend without constructing a billing system.

## 4. Deterministic media normalization

Every image becomes an immutable Media Asset:

1. <code>original</code>: accepted upload or raw provider response.
2. <code>master</code>: orientation fixed, metadata stripped, white padded, canonical PNG.
3. <code>preview</code>: responsive WebP.
4. <code>print</code>: letter-sized PNG only when the source resolution supports it.

Persist MIME, width, height, byte length, SHA-256, role, R2 key, source Job, source model, and normalization version.

Initial geometry:

- Coloring master: 1536×2048 portrait, white pad, never crop.
- Coloring preview: 768×1024 WebP.
- Print canvas: 2550×3300 PNG; do not label a low-resolution source as print-ready.
- Card art: preserve 2:3 composition and leave frame/text composition to the Card Renderer.

Cloudflare Images handles format and geometry. A small semantic check rejects an empty response, wrong aspect ratio, or obviously non-monochrome coloring output. If no retry has run, the second reserved attempt may be used once for repair; otherwise fail for an explicit user retry.

New APIs never return or accept base64.

## 5. One consolidated schema migration

Create <code>migrations/0007_creation_platform.sql</code>. It contains:

### Runtime

- <code>creation_jobs</code>: owner, idempotency key/hash, operation, quality, request JSON, status, stage, attempt count, reserved/charged credits, budget state, cancellation-request timestamp, result asset/revision IDs, target Card/expected Card revision, validated result JSON for text operations, error, timestamps.
- <code>daily_budgets</code>: owner/day/limit/reserved/used.
- <code>media_assets</code>: R2 metadata, role, visibility, provenance, timestamps.
- Small triggers reserve and settle daily credits exactly once; there is no separate ledger.

### Internal saved-creation collections

- <code>imagination_worlds</code>: internal collection boundary, title, description, timestamps, archived flag. The name is not exposed in the product.
- <code>artworks</code>: World, kind, title, current revision.
- <code>artwork_revisions</code>: Artwork, parent revision, Media Asset, source Job, prompt/instruction, input revision IDs JSON, provenance JSON, timestamp.
- <code>world_characters</code>: World, name, pinned Artwork Revision, notes.

Important constraints:

- <code>artwork_revisions.source_job_id</code> is unique.
- A repeated Workflow completion returns the existing revision.
- Updating the Artwork head uses <code>WHERE current_revision_id = parentRevisionId</code>.
- A concurrent completion that loses that comparison remains a visible branch; it is not discarded.

### Cards

- <code>card_documents</code>: World, title, current revision, timestamps.
- <code>card_revisions</code>: Card, parent revision, Artwork Revision, unique source Job, schema version, document JSON, timestamp.

Keep <code>trading_cards</code> from migration 0006 only as importable history. New code never writes it. Do not build an automated backfill; import a card manually only if it is worth keeping.

## 6. Parent-operated access

Do not build user accounts or device pairing.

- Add one <code>FAMILY_ACCESS_CODE</code> Worker secret.
- <code>POST /api/login</code> exchanges it for an HMAC-signed, Secure, HttpOnly, SameSite=Lax cookie.
- All Job, upload, World, private asset, and Card routes require that cookie.
- The same access code can be entered on another family device.
- Rate-limit login attempts and creation submissions with the Workers rate-limit binding.
- Existing public Hot or Not reads remain public.
- All new World assets are private and excluded from <code>/api/hot</code>.

This is a shared household door, not an identity system.

## 7. Automatic persistence without Worlds friction

Use durable artwork and card IDs in URLs while keeping the first screen prompt-first:

~~~text
/
/creations
/artworks/:artworkId
/cards
/cards/:cardId
~~~

<code>App.tsx</code> is a shell/router. The home screen silently reuses or creates one internal collection named “My Creations”; users never create or select a World. Old <code>/worlds/*</code> links redirect to the simpler routes.

Flow changes:

- Generate silently ensures the internal collection, creates an Artwork shell, and starts a durable Job.
- Preview loads an Artwork Revision by URL and survives refresh.
- Enhance, Fix Coloring, Remix, and Print create child revisions.
- Editor gets <code>onSave(blob, parentRevisionId)</code>; Save Art uploads and appends a revision.
- Download remains local and does not change history.
- Restore creates a new child from an older revision.
- Character Reference pins a named revision and supplies it to future Jobs.
- My creations aggregates saved artwork and cards without exposing their internal collection.
- Opening the same artwork URL on another logged-in family device restores it directly.

Required API:

~~~text
GET|POST /api/worlds
GET|PATCH /api/worlds/:id
GET|POST /api/worlds/:id/artworks
GET /api/artworks/:id
POST /api/artworks/:id/editor-revisions
GET|POST /api/worlds/:id/characters
~~~

## 8. Finish Trading Card Documents

The card is a document that points to art. The image model never draws the card frame or text.

~~~ts
interface CardDocumentV1 {
  schemaVersion: 1;
  name: string;
  typeLabel?: string;
  hp?: number;
  moves: Array<{
    id: string;
    name: string;
    description: string;
    power?: number;
    cost?: string[];
  }>;
  flavorText?: string;
  artworkPlacement: {
    focalX: number;
    focalY: number;
    zoom: number;
  };
  presentation: {
    theme: 'creature' | 'custom';
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    layout: 'standard-5x7-v1';
  };
}
~~~

Implementation:

- Replace <code>TradingCardGenerator.tsx</code> with a Card Document controller that hides its internal collection.
- Build <code>CardDocumentEditor.tsx</code> for real text/theme/rarity/crop fields.
- Build one <code>CardRenderer.tsx</code> used by preview, PNG export, print, and share.
- Render at fixed 500×700 design units; export at 3× to 1500×2100.
- Await fonts and image decode before capture.
- “Fix Text” disappears because text is editable.
- “New Attacks” requests structured suggestions and applies a selected patch.
- “Regenerate Art” stores the target Card and expected Card revision on the art Job, then creates exactly one Card revision keyed by source Job while copying every document field.
- Theme, rarity, copy, and crop updates never call the image model.
- Map the legacy <code>pokemon</code> theme to <code>creature</code> only when manually importing an old card.
- Delete or fold <code>CardFrame.tsx</code>, <code>TradingCardPreview.tsx</code>, and <code>CardExporter.tsx</code> after the new renderer owns their behavior.

Required API:

~~~text
POST /api/worlds/:worldId/cards
GET|PATCH /api/cards/:id
POST /api/cards/:id/regenerate-art
POST /api/cards/:id/copy-suggestions
~~~

Card PATCH includes the expected parent revision and returns 409 if the document changed elsewhere.

## Build sequence inside the single release

These are implementation checkpoints on one branch, not separate production rollouts.

### Checkpoint A: runtime foundation

- [ ] Add Worker Static Assets configuration and generated binding types.
- [ ] Add <code>0007_creation_platform.sql</code>.
- [ ] Add household login cookie and authorization helper.
- [ ] Add shared contracts and the fake model adapter.
- [ ] Upgrade <code>@google/genai</code> to current 2.x, add React Router and runtime schemas, update Wrangler/Workers types, add the Workers Vitest/Workflow setup, and synchronize both lockfiles.
- [ ] Replace Pages dev/deploy scripts with Worker dev, deploy, and type-generation scripts.
- [ ] Remove Vite's client-side Gemini environment loading/define; <code>GEMINI_API_KEY</code> exists only as a Worker secret.
- [ ] Port <code>/api/hot</code> GET/POST, <code>/hot</code>, <code>/hotornot</code>, <code>/api/suggestions</code>, suggestion seeding, social metadata, legacy public image-view, and SPA fallback behavior into the Worker router.
- [ ] Add the minimal household login/logout screen.
- [ ] Add a single <code>bun run check</code> command.

Exit: the Worker serves the current SPA and tests can run against D1, R2, Images, and Workflows locally.

### Checkpoint B: engine, Jobs, credits, and media

- [ ] Implement profiles, prompts, model catalog, errors, Engine, and Google adapter.
- [ ] Put every stable model ID in that catalog; do not edit the soon-to-be-deleted legacy provider routes.
- [ ] Route all five image operations and structured text operations through it.
- [ ] Implement upload, normalization, Media Asset storage, and authorized delivery.
- [ ] Implement Job acceptance plus credit reservation in one D1 transaction, idempotency, Workflow execution, two-attempt retry, cancellation, and the small stale-Job repair.
- [ ] Implement atomic daily credit reservation and settlement.
- [ ] Branch Workflow completion: image Jobs normalize and commit Media/Artwork; text Jobs validate and commit <code>result_json</code>.
- [ ] Replace fake frontend progress with Job status polling.

Exit: generate, edit, enhance, card-art generate/edit, and text suggestions all use one durable path with no base64.

### Checkpoint C: automatic persistence and Cards

- [ ] Add World, Artwork, Revision, Character, Card, and Card Revision repositories/APIs.
- [ ] Add a creation-first home, My creations library, durable artwork routes, and reload/reconnect behavior.
- [ ] Connect Generator, Preview, and Editor to Artwork revisions.
- [ ] Implement the Card Document editor and single renderer.
- [ ] Connect card art and card copy suggestions to the Creation Engine.
- [ ] Make all new assets private and filter them from Hot or Not.

Exit: creations survive refresh without an organizational setup step, artwork history branches safely, and a composed card can be edited, regenerated, exported, printed, and shared.

### Checkpoint D: rip the band-aid

- [ ] Remove the five old provider implementations and old frontend Gemini service.
- [ ] Remove pixel-based card editing and disconnected card components.
- [ ] Remove all retired/preview model IDs.
- [ ] Build and test the Worker artifact.
- [ ] Export D1 once.
- [ ] Apply migrations 0006 and 0007.
- [ ] Populate the three Worker secrets, daily credit value, and real rate-limit namespace.
- [ ] Deploy the Worker to <code>kieran.app</code>.
- [ ] Run the smoke path below.

Exit: there is one runtime, one Creation API, one model adapter, one schema, and no dormant legacy creation path.

## Focused validation

Automated:

- [ ] One contract test for each Creation operation.
- [ ] Google adapter mapping for success, filtered, no-output, 429, timeout, and 5xx.
- [ ] Same idempotency key creates one Job; definite transient failures stay within two attempts; ambiguous post-send timeouts do not auto-retry.
- [ ] Concurrent Job acceptance cannot exceed the daily credit limit.
- [ ] Workflow interruption resumes without duplicating an Artwork Revision.
- [ ] PNG/JPEG/WebP, corrupt, transparent, oversized, and orientation fixtures normalize correctly.
- [ ] Refreshing an artwork restores its active Job and revision history.
- [ ] Editor Save creates a revision; Download does not.
- [ ] Private World assets never appear in Hot or Not.
- [ ] Card fields survive art regeneration.
- [ ] Card preview and exported PNG use the same renderer and the PNG is 1500×2100.
- [ ] Apply migrations from a blank DB and from the current 0001-0006 state.
- [ ] Run one real deployed Images smoke covering orientation, white padding, <code>info()</code>, PNG master, and WebP preview; local Images mocks cover policy only.

One production smoke after deployment:

1. Log in with the household access code.
2. Generate one coloring page directly from the home screen with no setup step.
3. Refresh while an edit is running and confirm it reconnects.
4. Save one Editor revision.
5. Confirm it appears in My creations.
6. Create a card, edit its text/theme, regenerate only its art, and export it.
7. Confirm the new assets are absent from Hot or Not.
8. Confirm daily credits reserved and used reconcile to zero reserved.

The Worker route sits in front of the existing Pages custom domain during this smoke. If the smoke fails, disable that route to expose the recorded Pages deployment and fix forward on the same branch. If it passes, remove the old Pages project/domain binding. No alternate runtime is maintained afterward.

## Worker configuration

Target <code>wrangler.toml</code> shape:

~~~toml
name = "kieran-app"
main = "worker/index.ts"
compatibility_date = "2026-07-11"

routes = [
  { pattern = "kieran.app/*", zone_name = "kieran.app" }
]

[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*", "/hot", "/hotornot", "/cards", "/creations", "/artworks/*"]

[images]
binding = "IMAGES"

[[r2_buckets]]
binding = "IMAGES_BUCKET"
bucket_name = "kieran-images"

[[d1_databases]]
binding = "DB"
database_name = "kieran-db"
database_id = "2b58cfa4-5f85-424b-8643-bc440a177f82"

[[workflows]]
name = "kieran-creation"
binding = "CREATION_WORKFLOW"
class_name = "CreationWorkflow"

[[ratelimits]]
name = "APP_RATE_LIMITER"
namespace_id = "<new-positive-integer>"
  [ratelimits.simple]
  limit = 20
  period = 60

[triggers]
crons = ["*/5 * * * *"]

[vars]
DAILY_CREDIT_LIMIT = "40"
~~~

Secrets:

~~~text
GEMINI_API_KEY
FAMILY_ACCESS_CODE
SESSION_SIGNING_KEY
~~~

## Definition of done

- [ ] Exactly one module imports the Google SDK.
- [ ] Exactly one Creation Engine handles the five former image pipelines.
- [ ] Exactly one new API accepts durable creation work.
- [ ] Jobs survive refresh and Workflow step replay; client idempotency cannot create duplicate Jobs, and ambiguous provider outcomes never auto-retry.
- [ ] Daily credits cap accidental spend with replay-safe D1 reservation and settlement triggers.
- [ ] New image inputs and outputs are normalized R2 Media Assets; no new base64 path exists.
- [ ] Artwork revisions restore from direct URLs and appear in My creations; no World setup is exposed.
- [ ] Trading Cards are structured documents rendered consistently for preview/export/print/share.
- [ ] Every production image route resolves to Flash Lite 1K; no larger model is present in the production catalog.
- [ ] The Worker route owns <code>kieran.app</code>; the old Pages project is removed after the production smoke passes.
- [ ] Old provider routes, old Gemini service, and pixel card editing are gone.

## Primary implementation references

Google:

- [Image generation](https://ai.google.dev/gemini-api/docs/image-generation)
- [Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview)
- [Gemini 3.1 Flash Lite Image](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-image)
- [Deprecations](https://ai.google.dev/gemini-api/docs/deprecations)

Cloudflare:

- [Migrate Pages to Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
- [Workflows](https://developers.cloudflare.com/workflows/)
- [Workflow retries](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/)
- [D1 transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Images binding](https://developers.cloudflare.com/images/optimization/binding/)
- [Images limits](https://developers.cloudflare.com/images/get-started/limits/)
- [Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
