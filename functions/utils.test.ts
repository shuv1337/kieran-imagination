import { describe, it, expect, vi } from 'vitest';
import { resizeImageIfNeeded, TARGET_IMAGE_MAX_DIMENSION } from './utils';

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
    // Small valid PNG base64 (1x1 pixel)
    const smallPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    it('should not resize images under the max dimension', async () => {
        const mockBinding = createMockImagesBinding(800, 600);
        
        const result = await resizeImageIfNeeded(mockBinding as any, smallPngBase64);
        
        expect(result.wasResized).toBe(false);
        expect(result.originalWidth).toBe(800);
        expect(result.originalHeight).toBe(600);
        expect(result.newWidth).toBe(800);
        expect(result.newHeight).toBe(600);
        expect(result.base64Data).toBe(smallPngBase64);
        expect(mockBinding.input).not.toHaveBeenCalled();
    });

    it('should resize images exceeding max dimension (landscape)', async () => {
        const mockBinding = createMockImagesBinding(4000, 3000);
        
        const result = await resizeImageIfNeeded(mockBinding as any, smallPngBase64);
        
        expect(result.wasResized).toBe(true);
        expect(result.originalWidth).toBe(4000);
        expect(result.originalHeight).toBe(3000);
        expect(result.newWidth).toBe(TARGET_IMAGE_MAX_DIMENSION);
        expect(result.newHeight).toBe(Math.round((3000 / 4000) * TARGET_IMAGE_MAX_DIMENSION));
        expect(mockBinding.input).toHaveBeenCalled();
    });

    it('should resize images exceeding max dimension (portrait)', async () => {
        const mockBinding = createMockImagesBinding(3000, 4000);
        
        const result = await resizeImageIfNeeded(mockBinding as any, smallPngBase64);
        
        expect(result.wasResized).toBe(true);
        expect(result.originalWidth).toBe(3000);
        expect(result.originalHeight).toBe(4000);
        expect(result.newHeight).toBe(TARGET_IMAGE_MAX_DIMENSION);
        expect(result.newWidth).toBe(Math.round((3000 / 4000) * TARGET_IMAGE_MAX_DIMENSION));
    });

    it('should resize when only width exceeds max', async () => {
        const mockBinding = createMockImagesBinding(2000, 1000);
        
        const result = await resizeImageIfNeeded(mockBinding as any, smallPngBase64);
        
        expect(result.wasResized).toBe(true);
        expect(result.newWidth).toBe(TARGET_IMAGE_MAX_DIMENSION);
    });

    it('should resize when only height exceeds max', async () => {
        const mockBinding = createMockImagesBinding(1000, 2000);
        
        const result = await resizeImageIfNeeded(mockBinding as any, smallPngBase64);
        
        expect(result.wasResized).toBe(true);
        expect(result.newHeight).toBe(TARGET_IMAGE_MAX_DIMENSION);
    });

    it('should not resize images exactly at max dimension', async () => {
        const mockBinding = createMockImagesBinding(TARGET_IMAGE_MAX_DIMENSION, TARGET_IMAGE_MAX_DIMENSION);
        
        const result = await resizeImageIfNeeded(mockBinding as any, smallPngBase64);
        
        expect(result.wasResized).toBe(false);
    });

    it('should use custom max dimension when provided', async () => {
        const mockBinding = createMockImagesBinding(500, 400);
        const customMax = 300;
        
        const result = await resizeImageIfNeeded(mockBinding as any, smallPngBase64, customMax);
        
        expect(result.wasResized).toBe(true);
        expect(result.newWidth).toBe(customMax);
    });
});
