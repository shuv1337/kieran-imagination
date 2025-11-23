import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Generator } from './Generator';
import { generateColoringPage } from '../services/gemini';

vi.mock('../services/gemini', () => ({
  generateColoringPage: vi.fn(),
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
      screen.getByPlaceholderText(/robot dinosaur/i),
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
});
