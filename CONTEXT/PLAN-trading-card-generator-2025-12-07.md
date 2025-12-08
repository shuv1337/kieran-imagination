## Context & Goals
- Add a new trading card generator experience that fits the existing Kieran aesthetic and flow.
- **MVP Scope**: Support Pokémon-style and Custom themes at launch. Sports league themes (NFL, NBA, etc.) deferred to Phase 2 due to licensing complexity.
- Reuse existing infrastructure (Gemini API, R2 storage, D1 logging) and UI conventions (Framer Motion transitions, Tailwind gradients, playful typography, carousel prompts).
- Provide shareable/exportable card images with on-brand framing, rarity treatments, and metadata (name, stats, type, rarity icon).

## Current State (internal references)
- App shell and routing: `App.tsx:24-33` detects `/hot` and renders `HotOrNot`; otherwise renders generator/editor/preview flow.
- Coloring page generator UI/logic: `components/Generator.tsx` (prompt input, upload, suggestion carousel, generateColoringPage), `components/Preview.tsx`, `components/Editor.tsx`, `services/gemini.ts` (API client), `services/storage.ts` (R2 persistence), backend `functions/api/generate.ts`, `functions/api/images.ts`, `functions/api/images/view.ts`, `functions/utils.ts` (rate limiting, bindings), `functions/api/improve-prompt.ts`.
- Hot/Not route pattern: `components/HotOrNot.tsx`, routing in `functions/_middleware.ts` for meta tags.
- Build/stack: React 19 + Vite + Tailwind + Framer Motion + lucide-react; CF Pages Functions; R2 + D1; Bun package manager.
- **Key constraint**: Current Gemini prompts (`functions/api/generate.ts:122-137`) are engineered for B&W line art with explicit color suppression. Card generation requires a fundamentally different prompt strategy.

## External References (for implementation patterns)
- Framer Motion components/variants: https://github.com/framer/motion
- Lucide icons set (for rarity/emblems): https://github.com/lucide-icons/lucide
- Tailwind gradient and glassmorphism ideas: https://github.com/tailwindlabs/tailwindcss
- html2canvas for card export: https://github.com/niklasvh/html2canvas

## User Experience & IA

### Navigation Architecture
```
/           -> Coloring Page Generator (existing)
/cards      -> Trading Card Generator (new)
/hot        -> Hot or Not voting (existing)
```
- Add global navigation bar component for route switching (accessible from all routes)
- Cross-promote between features (e.g., "Try our Trading Cards!" on coloring page success)

### Card Generator Flow
1. **Input**: Prompt (or pick template) + select theme + select rarity
2. **Generate**: AI generates character art only (not full card)
3. **Preview**: Art composited into card frame via HTML/CSS overlay
4. **Customize**: Edit name, stats (Phase 2: defer stats editor to post-MVP)
5. **Export**: Download/share card as composed image

### Card Themes (MVP)
| Theme | Description | Badge Style |
|-------|-------------|-------------|
| `pokemon` | Pokémon-inspired creature cards | Elemental type icons (fire/water/grass/etc.) |
| `custom` | User-defined style | Generic star/shield badge |

### Card Themes (Phase 2 - Post-MVP)
| Theme | Notes |
|-------|-------|
| `sports` | Generic sports card (no league branding) |
| `superhero` | Comic book hero style |
| `fantasy` | D&D/RPG character cards |

**Decision**: Sports leagues (NFL, NBA, etc.) removed from scope due to trademark/licensing complexity. If pursued later, requires legal review and explicit disclaimer strategy.

### Card Layout Elements
- **Artwork area**: AI-generated character/subject art (center, ~70% of card)
- **Name banner**: Top of card, editable text
- **Type badge**: Theme-specific icon (e.g., fire type for Pokémon)
- **Rarity indicator**: Border treatment + corner icon
- **Stats area**: Bottom section with power/HP values (Phase 2)
- **Background pattern**: Theme-specific gradient/pattern

### Card Aspect Ratio
- Standard trading card: 2.5" x 3.5" = **5:7 ratio** (0.714)
- Gemini supported ratios: Check API docs; use closest available (likely 2:3 or 3:4)
- **Decision**: Use 2:3 aspect ratio for AI art generation, pad/crop to 5:7 in card frame composition

## Technical Approach

### Card Composition Architecture

**Strategy**: Generate art-only via Gemini, then overlay frame/chrome using HTML/CSS captured via `html2canvas` for export.

```
┌─────────────────────────────────────┐
│  CardFrame.tsx (HTML/CSS)           │
│  ┌─────────────────────────────┐    │
│  │  Name Banner                │    │
│  ├─────────────────────────────┤    │
│  │                             │    │
│  │  AI-Generated Art           │    │  <- <img> from Gemini
│  │  (character only)           │    │
│  │                             │    │
│  ├─────────────────────────────┤    │
│  │  Type Badge │ Rarity Icon   │    │  <- SVG/CSS overlays
│  │  Stats Area (Phase 2)       │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
         │
         ▼ html2canvas
    Exported PNG (shareable)
```

**Benefits**:
- Consistent card frames across all generations
- Easy to customize/update frames without regenerating art
- Art generation focused on single task (character illustration)
- Rarity effects (foil, shimmer) handled via CSS animations

### Routing & Views
- Add `/cards` detection in `App.tsx` (pattern from `/hot` at lines 24-33)
- New view enum: `AppView.CARDS` in `types.ts`
- Dedicated component tree: `components/cards/`

### Data & Models

Add to `types.ts`:

```typescript
// Card Themes - MVP
export enum CardTheme {
  POKEMON = 'pokemon',
  CUSTOM = 'custom',
}

// Card Rarities with visual mappings
export enum CardRarity {
  COMMON = 'common',      // Gray border, no effects
  UNCOMMON = 'uncommon',  // Green border, subtle shine
  RARE = 'rare',          // Blue border, shimmer effect
  EPIC = 'epic',          // Purple border, glow effect
  LEGENDARY = 'legendary', // Gold border, foil + particles
}

// Theme visual configuration
export interface CardThemeConfig {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  gradientFrom: string;
  gradientTo: string;
  badgeIcon: string; // Lucide icon name
  promptPrefix: string; // Added to user prompt for style consistency
}

// Rarity visual configuration
export interface CardRarityConfig {
  name: string;
  borderColor: string;
  glowColor: string;
  hasShimmer: boolean;
  hasFoil: boolean;
  hasParticles: boolean;
}

// Card specification for generation
export interface CardSpec {
  prompt: string;
  theme: CardTheme;
  rarity: CardRarity;
  cardName: string;
  baseImage?: string; // Optional reference image
}

// Extended response for card generation
export interface TradingCardResponse {
  url: string;           // R2 public URL for art
  previewUrl: string;    // Base64 data URL for immediate display
  key: string;           // R2 key
  cardId: string;        // Database ID
  theme: CardTheme;
  rarity: CardRarity;
  cardName: string;
  promptUsed: string;
}
```

### Database Schema

Create new migration `migrations/0006_trading_cards.sql`:

```sql
-- Trading card metadata
CREATE TABLE trading_cards (
  id TEXT PRIMARY KEY,
  generated_image_id TEXT NOT NULL,
  theme TEXT NOT NULL,
  rarity TEXT NOT NULL,
  card_name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  stats JSON,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (generated_image_id) REFERENCES generated_images(id)
);

CREATE INDEX idx_trading_cards_theme ON trading_cards(theme);
CREATE INDEX idx_trading_cards_created_at ON trading_cards(created_at DESC);
```

Update `functions/utils.ts` - extend `LLMRequestLogEntry.requestType` union:

```typescript
export interface LLMRequestLogEntry {
  requestType: 'generate' | 'edit' | 'upscale' | 'suggestions' | 'suggestions-seed' | 'improve-prompt' | 'card-generate';
  // ... rest unchanged
}
```

### APIs & Backend

#### `POST /api/cards/generate`

New file: `functions/api/cards/generate.ts`

**Request:**
```typescript
{
  prompt: string;
  theme: CardTheme;
  rarity: CardRarity;
  cardName: string;
  baseImage?: string; // Optional base64 reference image
}
```

**Response:**
```typescript
{
  url: string;
  previewUrl: string;
  key: string;
  cardId: string;
  theme: CardTheme;
  rarity: CardRarity;
  cardName: string;
  promptUsed: string;
}
```

**Gemini Prompt Strategy** (fundamentally different from coloring pages):

```typescript
const CARD_ART_PROMPT_TEMPLATE = `Create a trading card character illustration based on this description: "${prompt}".

STYLE REQUIREMENTS:
- Digital illustration style suitable for a trading card game
- Vibrant colors with good contrast
- Character should be the clear focal point
- Clean edges suitable for compositing onto a card frame
- Dynamic pose or expression
- ${themeSpecificInstructions[theme]}

COMPOSITION:
- Portrait or 3/4 view of the character/subject
- Leave space at top and bottom for card UI elements
- Centered composition
- Solid or simple gradient background (will be replaced by card frame)

DO NOT include:
- Card borders, frames, or UI elements
- Text or labels
- Multiple characters unless specified
- Busy backgrounds`;
```

**Theme-specific prompt additions:**
```typescript
const themeSpecificInstructions: Record<CardTheme, string> = {
  [CardTheme.POKEMON]: 'Creature design inspired by pocket monsters - cute but powerful, elemental themes',
  [CardTheme.CUSTOM]: 'Flexible style based on user description',
};
```

**Rate Limiting Decision**: Share rate limit bucket with coloring page generation to prevent abuse:
```typescript
enforceRateLimit(ip, 'generate'); // Same scope as /api/generate
```

### R2 Storage Path

**Decision**: Keep date-based path for consistency, add `source` metadata:

```typescript
// In saveImageToR2AndDb:
const key = `generated/${new Date().toISOString().split('T')[0]}/card-${id}.png`;
const metadata = {
  source: 'card-generate',
  theme,
  rarity,
  cardName,
};
```

### Frontend Integration

#### Services (`services/gemini.ts`)

Add new function:

```typescript
export const generateTradingCard = async (
  spec: CardSpec
): Promise<TradingCardResponse> => {
  const response = await fetch('/api/cards/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Card generation failed');
  }

  return response.json();
};
```

#### Card Templates (`components/cards/cardTemplates.ts`)

**Decision**: Inline JSON for MVP, migrate to API endpoint in Phase 2.

```typescript
export interface CardTemplate {
  id: string;
  name: string;
  prompt: string;
  theme: CardTheme;
  suggestedRarity: CardRarity;
  previewEmoji: string;
}

export const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: 'fire-dragon',
    name: 'Fire Dragon',
    prompt: 'A fierce fire-breathing dragon with glowing scales',
    theme: CardTheme.POKEMON,
    suggestedRarity: CardRarity.RARE,
    previewEmoji: '🐉',
  },
  {
    id: 'water-turtle',
    name: 'Water Turtle',
    prompt: 'A wise water turtle with a shell covered in coral',
    theme: CardTheme.POKEMON,
    suggestedRarity: CardRarity.UNCOMMON,
    previewEmoji: '🐢',
  },
  // ... more templates
];
```

#### Theme/Rarity Configs (`components/cards/cardConfigs.ts`)

```typescript
export const THEME_CONFIGS: Record<CardTheme, CardThemeConfig> = {
  [CardTheme.POKEMON]: {
    name: 'Creature Card',
    primaryColor: '#FFD700',
    secondaryColor: '#FF6B6B',
    gradientFrom: 'from-yellow-400',
    gradientTo: 'to-orange-500',
    badgeIcon: 'Zap',
    promptPrefix: 'pocket monster creature',
  },
  [CardTheme.CUSTOM]: {
    name: 'Custom Card',
    primaryColor: '#8B5CF6',
    secondaryColor: '#EC4899',
    gradientFrom: 'from-purple-500',
    gradientTo: 'to-pink-500',
    badgeIcon: 'Star',
    promptPrefix: '',
  },
};

export const RARITY_CONFIGS: Record<CardRarity, CardRarityConfig> = {
  [CardRarity.COMMON]: {
    name: 'Common',
    borderColor: 'border-slate-400',
    glowColor: '',
    hasShimmer: false,
    hasFoil: false,
    hasParticles: false,
  },
  [CardRarity.LEGENDARY]: {
    name: 'Legendary',
    borderColor: 'border-yellow-400',
    glowColor: 'shadow-yellow-400/50',
    hasShimmer: true,
    hasFoil: true,
    hasParticles: true,
  },
  // ... other rarities
};
```

### UI Components (`components/cards/`)

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| `TradingCardGenerator.tsx` | Main generator UI | Prompt input, theme/rarity selectors, template carousel, progress UI |
| `CardThemeSelector.tsx` | Theme picker | Chip/carousel with icons and colors |
| `CardRaritySelector.tsx` | Rarity picker | Visual chips showing border/effect preview |
| `CardTemplateCarousel.tsx` | Template browser | Horizontal scroll, emoji previews |
| `CardFrame.tsx` | Card chrome renderer | Border, badge, rarity effects, name overlay |
| `TradingCardPreview.tsx` | Result display | Download, share, regenerate actions |
| `CardExporter.tsx` | Export utility | html2canvas integration for PNG export |

### Middleware for Meta Tags

Extend `functions/_middleware.ts` to handle `/cards` route:

```typescript
if (path === '/cards') {
  const cardsMeta = {
    title: 'Trading Card Generator | Kieran\'s Imagination',
    description: 'Create custom trading cards with AI! Design your own Pokémon-style creature cards.',
    image: 'https://kieran.app/cards-share-banner.png',
  };
  // ... apply meta tag replacements
}
```

### Feature Flag for Soft Launch

Add query param support for gradual rollout:

```typescript
// In App.tsx
const isCardsEnabled = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('cards') === '1' || window.location.pathname === '/cards';
};
```

## Tasks & Implementation Order

### Milestone 1: Foundations & Routing
- [x] Add `AppView.CARDS` to `types.ts`
- [x] Add `/cards` route handling in `App.tsx` (similar to `/hot` pattern at lines 24-33)
- [x] Create `components/cards/` directory with placeholder `index.tsx`
- [x] Add `CardTheme`, `CardRarity`, and related types to `types.ts`
- [x] Add feature flag support (`?cards=1` query param)
- [x] Create basic navigation component for route switching

### Milestone 2: Database & Backend
- [x] Create migration `migrations/0006_trading_cards.sql`
- [x] Run migration locally: `npx wrangler d1 migrations apply kieran-db --local`
- [x] Update `LLMRequestLogEntry.requestType` union in `functions/utils.ts`
- [x] Implement `functions/api/cards/generate.ts` with:
  - [x] New Gemini prompt strategy for card art (NOT coloring page style)
  - [x] Theme-specific prompt additions
  - [x] R2 storage with `source: 'card-generate'` metadata
  - [x] D1 logging to both `llm_requests` and new `trading_cards` table
  - [x] Rate limiting (shared `'generate'` scope)
- [x] Add card-specific error messages for content filter blocks
- [ ] Write tests for new utilities in `functions/utils.test.ts`

### Milestone 3: Frontend Service & Types
- [x] Add `generateTradingCard` function to `services/gemini.ts`
- [x] Create `TradingCardResponse` interface
- [x] Create `components/cards/cardTemplates.ts` with MVP templates
- [x] Create `components/cards/cardConfigs.ts` with theme/rarity visual configs
- [x] Add card-specific error handling in service layer

### Milestone 4: Generator UI
- [x] Build `TradingCardGenerator.tsx`:
  - [x] Prompt textarea with card-specific placeholder
  - [x] Theme selector chips
  - [x] Rarity selector chips
  - [x] Template carousel (horizontal scroll on mobile)
  - [x] Card name input field
  - [x] Progress UI (reuse `progressStages` pattern with card-specific copy)
- [x] Build `CardThemeSelector.tsx` with Lucide icons
- [x] Build `CardRaritySelector.tsx` with effect previews
- [x] Build `CardTemplateCarousel.tsx`
- [x] Integrate with `ErrorModal` for error display
- [x] Ensure responsive layout (mobile-first)
- [x] Add Framer Motion transitions

### Milestone 5: Card Rendering & Preview
- [x] Build `CardFrame.tsx`:
  - [x] Theme-specific gradients and patterns
  - [x] Rarity-specific border treatments
  - [x] Foil/shimmer CSS effects for rare+ cards
  - [x] Name banner overlay
  - [x] Type badge positioning
- [x] Build `CardExporter.tsx` with html2canvas integration
- [x] Build `TradingCardPreview.tsx`:
  - [x] Full card preview with frame
  - [x] Download button (exports composed card via html2canvas)
  - [x] Share button (reuse `navigator.share` pattern from `Preview.tsx:43-75`)
  - [x] "Regenerate Art" action (keeps frame, regenerates art only)
  - [x] "Change Rarity" action (updates frame without regenerating)
- [x] Add fallback to data URL when R2 save fails

### Milestone 6: Polish & QA
- [x] Add `/cards` meta tags to `functions/_middleware.ts`
- [ ] Create `public/cards-share-banner.png` for OpenGraph
- [x] Add loading/skeleton states for card generation
- [x] Validate aspect ratio handling (2:3 art -> 5:7 card)
- [x] Test rarity effects performance on mobile (limit blur/particles)
- [x] Add analytics logging with `requestType: 'card-generate'`
- [ ] Write frontend tests:
  - [ ] `TradingCardGenerator.test.tsx`: prompt submission, theme selection, disabled state
  - [ ] `CardFrame.test.tsx`: renders correctly for each theme/rarity combo
- [ ] Cross-browser testing (Chrome, Safari mobile)
- [ ] Lighthouse performance audit
- [ ] Accessibility audit: focus states, ARIA labels

### Milestone 7: Launch
- [ ] Run production migration: `npx wrangler d1 migrations apply kieran-db --remote`
- [ ] Deploy with feature flag enabled (`?cards=1`)
- [ ] Monitor error rates and generation quality
- [ ] Remove feature flag for general availability
- [ ] Add cross-promotion from coloring page success screen

## Validation Criteria

### Routing
- [x] Visiting `/cards` renders Trading Card Generator UI
- [x] Visiting `/` still renders Coloring Page Generator (unchanged)
- [x] Visiting `/hot` still renders Hot or Not (unchanged)
- [x] Navigation between routes works correctly

### API
- [x] `POST /api/cards/generate` returns `TradingCardResponse` with all fields
- [x] Generated art persists to R2 with correct metadata
- [x] Request logged to `llm_requests` table with `request_type='card-generate'`
- [x] Card metadata saved to `trading_cards` table
- [x] Rate limiting enforced (shared with `/api/generate`)
- [x] Content filter blocks return user-friendly card-specific error

### UI
- [x] User can select theme from available options
- [x] User can select rarity with visual preview of effects
- [x] User can enter custom prompt or select template
- [x] User can enter card name
- [x] Progress UI shows card-specific messages during generation
- [x] Generated card displays in `CardFrame` with correct theme/rarity styling
- [x] Download exports composed card (not just art) as PNG
- [x] Share works via Web Share API (with fallback)
- [x] Responsive layout: stacked on mobile, side-by-side on desktop

### Visuals
- [x] Each theme has distinct gradient/color scheme
- [x] Each rarity has distinct border and effects
- [x] Legendary cards show foil/shimmer animation
- [x] Card name renders correctly in banner
- [x] Art fits correctly within card frame

### Performance
- [ ] Card generation completes in <45 seconds
- [x] Rarity effects don't cause frame drops on mobile
- [ ] html2canvas export completes in <3 seconds

### Tests
- [x] `bun run test` passes with new tests
- [x] No regressions in existing coloring page tests

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Gemini produces inconsistent art styles** | Medium | Medium | Add strict style instructions in prompt; consider retry logic |
| **html2canvas export quality issues** | Medium | Low | Test across browsers; provide "art-only" download fallback |
| **Foil effects slow on low-end mobile** | Medium | Low | Use `prefers-reduced-motion` media query; throttle particle effects |
| **Content filter blocks legitimate prompts** | Low | Medium | Card-specific error message with suggestion to modify prompt |
| **Rate limit exhaustion from testing** | Low | Low | Separate dev/prod rate limit configs |

## Phase 2: Post-MVP Enhancements

### Deferred from MVP
- [ ] Stats editor (HP, attack, defense values)
- [ ] Sports league themes (requires legal review)
- [ ] Superhero/Fantasy themes
- [ ] API endpoint for templates (`GET /api/cards/templates`)
- [ ] User accounts to save card collections

### Future Ideas
- [ ] Card gallery/Hot-or-Not for cards (`/cards/hot`)
- [ ] Card deck builder
- [ ] Print-ready PDF export (multiple cards per page)
- [ ] Multi-language template support
- [ ] Card series/sets with collection tracking
- [ ] Animated card effects (CSS/Lottie)
