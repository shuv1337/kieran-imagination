import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Generator } from './Generator';
import { generateColoringPage } from '../services/gemini';

vi.mock('../services/gemini', () => ({
  generateColoringPage: vi.fn(),
  fetchSuggestions: vi.fn().mockResolvedValue(['A test suggestion']),
}));

const mockGenerateColoringPage = generateColoringPage as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
  mockGenerateColoringPage.mockReset();
  vi.restoreAllMocks();
});

describe('Generator', () => {
  it('disables Generate button when no prompt or upload is provided', () => {
    render(<Generator onImageGenerated={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: /generate page/i })
    ).toBeDisabled();
  });

  it('calls Gemini service and propagates the generated image', async () => {
    const onImageGenerated = vi.fn();
    mockGenerateColoringPage.mockResolvedValueOnce({
      url: '/api/images/view?key=generated/2025-11-22/test.png',
      previewUrl: 'data:image/png;base64,fake',
      key: 'generated/2025-11-22/test.png'
    });
    vi.spyOn(Date, 'now').mockReturnValue(1234567890);

    render(<Generator onImageGenerated={onImageGenerated} />);

    fireEvent.change(
      screen.getByPlaceholderText(/I want a coloring page of.../i),
      { target: { value: 'A dragon with balloons' } }
    );

    const generateButton = screen.getByRole('button', { name: /generate page/i });
    fireEvent.click(generateButton);

    expect(generateButton).toBeDisabled();

    await waitFor(() => {
      expect(mockGenerateColoringPage).toHaveBeenCalledWith(
        'A dragon with balloons',
        undefined
      );
      expect(onImageGenerated).toHaveBeenCalledWith(
        'data:image/png;base64,fake', 
        'a-dragon-with-balloons-1234567890.png',
        'generated/2025-11-22/test.png',
        '/api/images/view?key=generated/2025-11-22/test.png'
      );
    });

    expect(generateButton).not.toBeDisabled();
  });

  it('handles image paste events', async () => {
    const onImageGenerated = vi.fn();
    render(<Generator onImageGenerated={onImageGenerated} />);

    // Create a fake file
    const file = new File(['(⌐□_□)'], 'cool-cat.png', { type: 'image/png' });
    
    // Mock FileReader
    const originalFileReader = global.FileReader;
    const mockFileReader = class {
        onloadend: (() => void) | null = null;
        result: string | null = null;
        readAsDataURL(_blob: Blob) {
            this.result = 'data:image/png;base64,fake-pasted-image';
            this.onloadend?.();
        }
    } as unknown as typeof FileReader;
    
    global.FileReader = mockFileReader;

    // Create clipboard event with the file
    const clipboardData = {
      items: [
        {
          type: 'image/png',
          getAsFile: () => file,
        },
      ],
    };

    const pasteEvent = new Event('paste', {
        bubbles: true,
        cancelable: true,
    });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: clipboardData,
    });

    // Dispatch paste event
    fireEvent(window, pasteEvent);

    // Verify that the image is "uploaded" (displayed in the UI)
    await waitFor(() => {
        expect(screen.getByText('Photo Added!')).toBeInTheDocument();
        expect(screen.getByAltText('Ref')).toHaveAttribute('src', 'data:image/png;base64,fake-pasted-image');
    });

    // Cleanup
    global.FileReader = originalFileReader;
  });
});
