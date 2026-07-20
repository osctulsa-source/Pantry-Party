import * as Haptics from 'expo-haptics';

import { feedback } from './feedback';
import { setFeedbackPref } from './feedbackPrefs';

jest.mock('expo-audio', () => {
  throw new Error('native module missing (old build)');
});

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));

describe('feedback', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await setFeedbackPref('haptics', true);
    await setFeedbackPref('sounds', true);
  });

  it('fires the matching haptic per event', () => {
    feedback.tick();
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    feedback.pop();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    feedback.success();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  it('respects the haptics toggle', async () => {
    await setFeedbackPref('haptics', false);
    feedback.tick();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('never throws when expo-audio is unavailable', () => {
    expect(() => {
      feedback.tick();
      feedback.pop();
      feedback.timerDone();
      feedback.success();
    }).not.toThrow();
  });
});
