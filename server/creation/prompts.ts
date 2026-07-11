import type { CreationRequest } from '../../shared/creation';
import type { CreationProfile } from './profiles';

const COLORING_RULES = `CRITICAL REQUIREMENTS - The output MUST be an UNCOLORED coloring page:
- ONLY pure black lines (#000000) on a pure white background (#FFFFFF)
- ABSOLUTELY NO filled-in colors, shading, grayscale areas, or gradients
- ABSOLUTELY NO pre-colored sections - every area must be empty white space ready to be colored in by a child
- This is a COLORING PAGE - all shapes must be OUTLINES ONLY with hollow interiors

Style Requirements:
- OUTPUT STYLE: Clean digital vector line art, NOT a photograph of a drawing
- Clean, thick black outlines suitable for coloring with crayons or markers
- All shapes should be outlined but NOT filled in - leave interiors white/empty
- NO: Wood grain, table textures, paper textures, or physical background surfaces
- NO: Borders, frames, or edges of paper visible
- The image should look like a direct digital scan or vector export
- Subject centered with white space padding around the edges`;

const CARD_ART_RULES = `Create trading-card ARTWORK ONLY for kids:
- Full-bleed illustration of the subject
- Do NOT draw any card frame, border, title banner, stats boxes, or text of any kind
- Do NOT include watermarks or logos
- Vibrant, friendly, kid-safe character art
- Portrait composition suitable for a 2:3 trading card art window`;

export function buildPromptText(profile: CreationProfile, request: CreationRequest): string {
  switch (profile.id) {
    case 'coloring-generate.v1':
      return `Create a printable, black-and-white line art coloring page for children from this description: "${request.prompt ?? ''}".

${COLORING_RULES}`;

    case 'coloring-edit.v1':
      return `Edit this black-and-white coloring page according to the instruction while preserving overall composition.

Instruction: ${request.instruction ?? ''}

${COLORING_RULES}`;

    case 'coloring-enhance.v1':
      return `Add more crisp black line art detail and small patterns to the existing shapes while keeping it a clean, printable black-and-white coloring page. Do not add shading, grayscale, colors, textures, frames, or backgrounds.

${COLORING_RULES}`;

    case 'card-art-generate.v1':
      return `${CARD_ART_RULES}

Subject: ${request.prompt ?? ''}`;

    case 'card-art-edit.v1':
      return `${CARD_ART_RULES}

Edit the existing card art according to this instruction: ${request.instruction ?? ''}
Keep composition and character identity unless the instruction says otherwise. No text or frame.`;

    case 'card-copy-suggest.v1':
      return `You invent kid-friendly trading card moves and flavor text.
Return ONLY valid JSON matching:
{"moves":[{"id":"string","name":"string","description":"string","power":number,"cost":["string"]}],"flavorText":"string"}
Provide 3 creative moves for a card named/described as: ${request.prompt ?? 'a fun creature'}.
Keep language appropriate for children ages 6-10.`;

    case 'prompt-improve.v1':
      return `Improve this kids coloring-page prompt to be more vivid, specific, and kid-safe while keeping the core idea.
Return ONLY valid JSON: {"improvedPrompt":"..."}.
Original prompt: ${request.prompt ?? ''}`;

    case 'suggestions-generate.v1':
      return `Generate 8 fun, kid-safe coloring page ideas for children ages 5-10.
Return ONLY valid JSON: {"suggestions":["emoji + short idea", ...]}.
Ideas should be creative and diverse (animals, space, fantasy, sports, vehicles).`;

    default:
      return request.prompt ?? request.instruction ?? '';
  }
}

export function defaultEnhanceInstruction(): string {
  return 'Add more crisp black line art detail and small patterns to the existing shapes while keeping it a clean, printable black-and-white coloring page. Do not add shading, grayscale, colors, textures, frames, or backgrounds.';
}

export function defaultFixColoringInstruction(): string {
  return 'This image has coloring or shading that should not be there. Convert it into a proper black-and-white coloring page with ONLY pure black outlines on a pure white background. Remove ALL colors, shading, gradients, and filled-in areas. Every shape should be an empty outline ready to be colored in by a child.';
}
