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
});
