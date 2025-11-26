import { describe, it, expect, vi } from 'vitest';
import { resizeImageIfNeeded, TARGET_IMAGE_MAX_DIMENSION, RESIZE_THRESHOLD_BYTES } from './utils';

// Mock ImagesBinding
const createMockImagesBinding = (width: number, height: number) => {
    const mockResponse = {
        arrayBuffer: async () => new ArrayBuffer(100)
    };
    
    return {
        info: vi.fn().mockResolvedValue({ width, height, format: 'image/png' }),
        input: vi.fn().mockReturnValue({
            transform: vi.fn().mockReturnValue({
                output: vi.fn().mockResolvedValue({
                    response: vi.fn().mockResolvedValue(mockResponse)
                })
            })
        })
    };
};

describe('resizeImageIfNeeded', () => {
    // Small valid PNG base64 (1x1 pixel) - way under threshold
    const smallPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    
    // Create a large fake base64 string that exceeds threshold (for testing resize trigger)
    const createLargeBase64 = (sizeBytes: number) => {
        // Base64 encodes 3 bytes into 4 chars, so we need sizeBytes * 4/3 chars
        const chars = Math.ceil(sizeBytes * 4 / 3);
        return 'A'.repeat(chars);
    };

    it('should skip resize entirely for images under size threshold', async () => {
        const mockBinding = createMockImagesBinding(4000, 3000);
        
        // Small image - should skip without even checking dimensions
        const result = await resizeImageIfNeeded(mockBinding as any, smallPngBase64);
        
        expect(result.wasResized).toBe(false);
        expect(result.base64Data).toBe(smallPngBase64);
        expect(mockBinding.info).not.toHaveBeenCalled(); // Didn't even check dimensions
    });

    it('should resize large images (over threshold) with large dimensions', async () => {
        const mockBinding = createMockImagesBinding(4000, 3000);
        const largeBase64 = createLargeBase64(RESIZE_THRESHOLD_BYTES + 1000000);
        
        const result = await resizeImageIfNeeded(mockBinding as any, largeBase64, TARGET_IMAGE_MAX_DIMENSION, RESIZE_THRESHOLD_BYTES);
        
        expect(result.wasResized).toBe(true);
        expect(result.originalWidth).toBe(4000);
        expect(result.originalHeight).toBe(3000);
        expect(result.newWidth).toBe(TARGET_IMAGE_MAX_DIMENSION);
        expect(mockBinding.input).toHaveBeenCalled();
    });

    it('should not resize large file if dimensions are already small', async () => {
        const mockBinding = createMockImagesBinding(800, 600); // Small dimensions
        const largeBase64 = createLargeBase64(RESIZE_THRESHOLD_BYTES + 1000000);
        
        const result = await resizeImageIfNeeded(mockBinding as any, largeBase64, TARGET_IMAGE_MAX_DIMENSION, RESIZE_THRESHOLD_BYTES);
        
        // Dimensions don't need resizing (800 < 1024, within 90% threshold)
        expect(result.wasResized).toBe(false);
        expect(result.originalWidth).toBe(800);
    });

    it('should resize portrait images correctly', async () => {
        const mockBinding = createMockImagesBinding(3000, 4000);
        const largeBase64 = createLargeBase64(RESIZE_THRESHOLD_BYTES + 1000000);
        
        const result = await resizeImageIfNeeded(mockBinding as any, largeBase64, TARGET_IMAGE_MAX_DIMENSION, RESIZE_THRESHOLD_BYTES);
        
        expect(result.wasResized).toBe(true);
        expect(result.newHeight).toBe(TARGET_IMAGE_MAX_DIMENSION);
        expect(result.newWidth).toBe(Math.round((3000 / 4000) * TARGET_IMAGE_MAX_DIMENSION));
    });

    it('should use custom threshold when provided', async () => {
        const mockBinding = createMockImagesBinding(2000, 1500);
        const customThreshold = 100; // Very low threshold
        const mediumBase64 = createLargeBase64(500); // Over custom threshold
        
        const result = await resizeImageIfNeeded(mockBinding as any, mediumBase64, TARGET_IMAGE_MAX_DIMENSION, customThreshold);
        
        expect(result.wasResized).toBe(true);
        expect(mockBinding.info).toHaveBeenCalled();
    });
});
