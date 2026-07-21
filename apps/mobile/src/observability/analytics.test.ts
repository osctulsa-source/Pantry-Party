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
});
