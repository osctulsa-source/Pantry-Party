import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_TASTE_PROFILE } from '@breadbox/core';

import { useTasteProfile } from './useTasteProfile';

// Guards the first-launch race that would wipe a shared household's taste
// profile: loadedFor must track the household the loaded profile belongs to,
// so a null→resolved transition never reports a stale EMPTY as "loaded for"
// the real household. See the hook header + OnboardingScreen's save gate.
describe('useTasteProfile loadedFor', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('is null while the household is unresolved, even though loaded flips true', async () => {
    const { result } = renderHook(() => useTasteProfile(null));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    // loaded is true on the null fast-path, but the profile belongs to no household.
    expect(result.current.loadedFor).toBeNull();
  });

  it('reports loadedFor === householdId once the real profile has loaded', async () => {
    await AsyncStorage.setItem(
      'tasteProfile:house-1',
      JSON.stringify({ ...EMPTY_TASTE_PROFILE, cuisines: ['italian'], flavors: ['spicy'] }),
    );
    const { result } = renderHook(() => useTasteProfile('house-1'));
    await waitFor(() => expect(result.current.loadedFor).toBe('house-1'));
    expect(result.current.profile.cuisines).toEqual(['italian']);
  });

  it('a save that merges onto the loaded profile preserves cuisines/flavors', async () => {
    await AsyncStorage.setItem(
      'tasteProfile:house-1',
      JSON.stringify({ ...EMPTY_TASTE_PROFILE, cuisines: ['italian'], flavors: ['spicy'] }),
    );
    const { result } = renderHook(() => useTasteProfile('house-1'));
    await waitFor(() => expect(result.current.loadedFor).toBe('house-1'));

    act(() => {
      result.current.save({ ...result.current.profile, diets: ['vegan'], allergies: ['egg'] });
    });

    expect(result.current.profile.diets).toEqual(['vegan']);
    expect(result.current.profile.allergies).toEqual(['egg']);
    // The gap the race would have wiped:
    expect(result.current.profile.cuisines).toEqual(['italian']);
    expect(result.current.profile.flavors).toEqual(['spicy']);

    const stored = JSON.parse((await AsyncStorage.getItem('tasteProfile:house-1')) ?? '{}');
    expect(stored.cuisines).toEqual(['italian']);
    expect(stored.diets).toEqual(['vegan']);
  });
});
