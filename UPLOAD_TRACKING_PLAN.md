# Upload Tracking Plan

## Current State

### How Images Are Currently Saved

| Source | Endpoint | When Saved | Stored As |
|--------|----------|------------|-----------|
| `generate` | `/api/generate` | After AI generates coloring page | `source: 'generate'` |
| `edit` | `/api/edit` | After AI edits an image | `source: 'edit'` |
| `upscale` | `/api/upscale` | After AI upscales an image | `source: 'upscale'` |
| `upload` | `/api/images` | Almost never (fallback only) | `source: 'upload'` |

### The Gap

When users upload/paste a reference image in the Generator:
1. The image is held in browser state (`uploadedImage`)
2. It's sent to `/api/generate` as `referenceImage` parameter
3. Only the **generated output** is saved to R2/database
4. The **original uploaded image is never persisted**

This means:
- We can't see what reference images users are uploading
- We can't analyze input vs output quality
- We lose context about what users are trying to convert

---

## Proposed Solution

### 1. Save Reference Images on Upload

**New Endpoint: `/api/upload`** (or modify existing `/api/images`)

When a user uploads/pastes an image, immediately save it:

```typescript
// POST /api/upload
{
  dataUrl: string;      // The uploaded image
  context: 'reference'; // Why it was uploaded
}

// Response
{
  id: string;           // UUID for tracking
  key: string;          // R2 key
  publicUrl: string;    // Viewable URL
}
```

### 2. Link Reference Images to Generations

Modify the `generated_images` table or create a relationship:

**Option A: Add column to `generated_images`**
```sql
ALTER TABLE generated_images 
ADD COLUMN reference_image_id TEXT;
```

**Option B: New `uploaded_images` table**
```sql
CREATE TABLE uploaded_images (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  file_size INTEGER,
  context TEXT DEFAULT 'reference'  -- 'reference', 'direct', etc.
);

-- Link table
CREATE TABLE generation_references (
  generation_id TEXT REFERENCES generated_images(id),
  upload_id TEXT REFERENCES uploaded_images(id),
  PRIMARY KEY (generation_id, upload_id)
);
```

### 3. Frontend Changes (kieran-app)

**Generator.tsx**
```typescript
const handleFileUpload = async (file: File) => {
  const dataUrl = await readFileAsDataUrl(file);
  
  // Save to backend immediately
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, context: 'reference' })
  });
  
  const { id, publicUrl } = await response.json();
  
  setUploadedImage(dataUrl);
  setUploadedImageId(id);  // Track for linking to generation
};

const handleGenerate = async () => {
  const result = await generateColoringPage(prompt, uploadedImage, uploadedImageId);
  // ...
};
```

**Modify `/api/generate`**
```typescript
// Accept optional referenceImageId
const { prompt, referenceImage, referenceImageId } = body;

// When saving the generated image, link to reference
await saveImageToR2AndDb(env, base64Image, prompt, 'generate', {
  referenceImageId  // Store the link
});
```

### 4. Admin Panel Changes (kieran-app-admin)

**New "Uploads" page or tab** showing:
- All uploaded reference images
- Upload timestamp
- IP address
- Whether it was used in a generation
- Link to resulting generation(s)

**Enhanced Images page:**
- Show reference image thumbnail alongside generated image
- Filter by "has reference image"
- Side-by-side comparison view

---

## Implementation Steps

### Phase 1: Backend Infrastructure
1. [ ] Create `uploaded_images` table migration
2. [ ] Create `/api/upload` endpoint in kieran-app
3. [ ] Add `reference_image_id` column to `generated_images`
4. [ ] Modify `saveImageToR2AndDb` to accept reference link

### Phase 2: Frontend Upload Tracking
5. [ ] Update Generator.tsx to save uploads immediately
6. [ ] Pass reference ID to generate endpoint
7. [ ] Handle upload errors gracefully (don't block generation)

### Phase 3: Admin Panel
8. [ ] Add `/api/uploads` endpoint to admin API
9. [ ] Create Uploads.tsx component
10. [ ] Update Images.tsx to show reference images
11. [ ] Add reference image to image detail modal

### Phase 4: Analytics (Optional)
12. [ ] Track upload-to-generation conversion rate
13. [ ] Track most common image types uploaded
14. [ ] Track file sizes and failure rates

---

## Database Schema

```sql
-- Migration: 0005_uploaded_images.sql

CREATE TABLE uploaded_images (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  file_size INTEGER,
  mime_type TEXT,
  context TEXT DEFAULT 'reference'
);

CREATE INDEX idx_uploaded_images_created ON uploaded_images(created_at DESC);
CREATE INDEX idx_uploaded_images_ip ON uploaded_images(ip_address);

-- Add reference link to generated_images
ALTER TABLE generated_images ADD COLUMN reference_image_id TEXT REFERENCES uploaded_images(id);
```

---

## API Changes Summary

| Endpoint | Change |
|----------|--------|
| `POST /api/upload` | **NEW** - Save uploaded image, return ID |
| `POST /api/generate` | Accept `referenceImageId`, store link |
| `GET /api/uploads` | **NEW** (admin) - List uploaded images |
| `GET /api/images` | Include `reference_image_id` and reference details |

---

## Considerations

### Storage Costs
- Reference images will increase R2 storage usage
- Consider: retention policy for unused uploads?
- Consider: compression/resizing before storage?

### Privacy
- Reference images may contain personal photos
- Consider: auto-delete after X days?
- Consider: don't show in public gallery?

### Rate Limiting
- Upload endpoint needs rate limiting
- Prevent abuse (uploading without generating)

### File Validation
- Validate image format (PNG, JPG, WebP)
- Enforce max file size (current: 10MB)
- Scan for malicious content?
