import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSavedTips } from './useSavedTips';

describe('useSavedTips', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('starts empty for a fresh user', async () => {
    const { result } = renderHook(() => useSavedTips('user-1'));
    await waitFor(() => expect(result.current.savedIds).toEqual([]));
  });

  it('loads previously saved ids for the user', async () => {
    await AsyncStorage.setItem('savedTips:user-1', JSON.stringify(['cw-1', 'ba-3']));
    const { result } = renderHook(() => useSavedTips('user-1'));
    await waitFor(() => expect(result.current.savedIds).toEqual(['cw-1', 'ba-3']));
  });

  it('toggle adds then removes, and persists', async () => {
    const { result } = renderHook(() => useSavedTips('user-1'));
    await waitFor(() => expect(result.current.savedIds).toEqual([]));

    act(() => result.current.toggle('te-2'));
    expect(result.current.savedIds).toEqual(['te-2']);
    await waitFor(async () =>
      expect(JSON.parse((await AsyncStorage.getItem('savedTips:user-1')) ?? '[]')).toEqual(['te-2']),
    );

    act(() => result.current.toggle('te-2'));
    expect(result.current.savedIds).toEqual([]);
  });

  it('falls back to empty on corrupt storage', async () => {
    await AsyncStorage.setItem('savedTips:user-1', 'not json');
    const { result } = renderHook(() => useSavedTips('user-1'));
    await waitFor(() => expect(result.current.savedIds).toEqual([]));
  });

  it('null user: empty and never writes', async () => {
    const { result } = renderHook(() => useSavedTips(null));
    await waitFor(() => expect(result.current.savedIds).toEqual([]));
    act(() => result.current.toggle('cw-1'));
    expect(result.current.savedIds).toEqual(['cw-1']); // in-memory only this session
    expect(await AsyncStorage.getItem('savedTips:null')).toBeNull();
  });
});
