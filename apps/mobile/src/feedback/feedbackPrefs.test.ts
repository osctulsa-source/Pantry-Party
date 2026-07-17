import AsyncStorage from '@react-native-async-storage/async-storage';

import { getFeedbackPrefs, hydrateFeedbackPrefs, setFeedbackPref } from './feedbackPrefs';

describe('feedbackPrefs', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('defaults both to on', async () => {
    await hydrateFeedbackPrefs();
    expect(getFeedbackPrefs()).toEqual({ sounds: true, haptics: true });
  });

  it('persists and caches a change synchronously', async () => {
    await setFeedbackPref('sounds', false);
    expect(getFeedbackPrefs().sounds).toBe(false);
    expect(await AsyncStorage.getItem('feedback.sounds')).toBe('off');
  });

  it('hydrates persisted values', async () => {
    await AsyncStorage.setItem('feedback.haptics', 'off');
    await hydrateFeedbackPrefs();
    expect(getFeedbackPrefs()).toEqual({ sounds: true, haptics: false });
  });
});
