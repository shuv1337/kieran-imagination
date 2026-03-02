<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1dl_BlAvM6WXNkPTJ0mogx9_kqa4b7YNU

## Run Locally

**Prerequisites:**  [Bun](https://bun.sh) (v1.3.3+)

1. Install dependencies:
   `bun install`
2. Set your local Cloudflare function vars in `.dev.vars` (copy from `.dev.vars.example`):
   - `GEMINI_API_KEY=...`
   - Optional: `GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview`
3. Run the app:
   `bun run dev`
4. Run tests:
   `bun run test`
