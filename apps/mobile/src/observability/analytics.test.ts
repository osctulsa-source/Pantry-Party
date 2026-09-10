jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'test-uuid' }));
jest.mock('./posthog', () => ({
  capturePostHog: jest.fn(),
}));

// `mock`-prefixed so jest's mock-factory hoisting allows referencing it below.
const mockInsert = jest.fn().mockRejectedValue(new Error('network down'));
jest.mock('../data/supabase/client', () => ({
  supabase: {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null } }) },
    from: jest.fn(() => ({ insert: mockInsert })),
  },
}));

import { track } from './analytics';
import { capturePostHog } from './posthog';

describe('track', () => {
  it('never throws even when the insert rejects', async () => {
    await expect(track('recipe_opened', { id: 1 })).resolves.toBeUndefined();
  });

  it('attempts exactly one insert into analytics_events', async () => {
    mockInsert.mockClear();
    await track('first_match_shown', { count: 3 });
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('dual-writes the event to PostHog', async () => {
    (capturePostHog as jest.Mock).mockClear();
    await track('cook_this_confirmed', { recipe_id: 'abc' });
    expect(capturePostHog).toHaveBeenCalledWith(
      'cook_this_confirmed',
      expect.objectContaining({ recipe_id: 'abc', install_id: 'test-uuid' }),
    );
  });

  // The capture-accuracy event: `source` must survive the round trip, because
  // splitting 'household' from 'off' is what makes the hit rate mean anything.
  it('passes hit and source through for scan_result', async () => {
    (capturePostHog as jest.Mock).mockClear();
    await track('scan_result', { hit: false, source: 'off' });
    expect(capturePostHog).toHaveBeenCalledWith(
      'scan_result',
      expect.objectContaining({ hit: false, source: 'off', install_id: 'test-uuid' }),
    );
  });

  // OCR accuracy proxies are counts only (items parsed, chars read) — the
  // recognized text itself must never reach analytics.
  it('passes counts through for ocr_result', async () => {
    (capturePostHog as jest.Mock).mockClear();
    await track('ocr_result', { ok: true, items: 7, text_chars: 412 });
    expect(capturePostHog).toHaveBeenCalledWith(
      'ocr_result',
      expect.objectContaining({ ok: true, items: 7, text_chars: 412, install_id: 'test-uuid' }),
    );
  });

  it('passes parsed vs kept counts through for ocr_review', async () => {
    (capturePostHog as jest.Mock).mockClear();
    await track('ocr_review', { parsed: 9, kept: 6 });
    expect(capturePostHog).toHaveBeenCalledWith(
      'ocr_review',
      expect.objectContaining({ parsed: 9, kept: 6, install_id: 'test-uuid' }),
    );
  });
});
