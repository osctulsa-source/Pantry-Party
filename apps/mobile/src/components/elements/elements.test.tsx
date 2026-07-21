import { fireEvent, render, screen } from '@testing-library/react-native';

import { AppIconBadge, BannerNotification } from './NotificationBadge';
import { BadgeGrid, type Badge } from './AchievementBadges';
import { SettingsList, SettingsTiles, type SettingsItem } from './SettingsRows';

// The non-animated elements depend only on RN core + tokens + BrandIcon (pure
// react-native-svg, already proven to render under jest by BrandTile.test), so
// they need no extra native mocks. ProgressRingBadge is excluded here: it drives
// react-native-reanimated, which the mobile jest harness doesn't mock.

describe('AppIconBadge', () => {
  it('announces the unread count when present', () => {
    render(<AppIconBadge count={3} />);
    expect(screen.getByLabelText('3 unread notifications')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('clamps the visible count to 9+ and singularizes one', () => {
    render(<AppIconBadge count={12} />);
    expect(screen.getByText('9+')).toBeTruthy();
    render(<AppIconBadge count={1} />);
    expect(screen.getByLabelText('1 unread notification')).toBeTruthy();
  });

  it('shows no badge at zero', () => {
    render(<AppIconBadge count={0} />);
    expect(screen.getByLabelText('No unread notifications')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });
});

describe('BannerNotification', () => {
  it('exposes title and body as a combined label', () => {
    render(<BannerNotification food="tomato" title="Expiring soon" body="Use the tomatoes" />);
    expect(screen.getByLabelText('Expiring soon. Use the tomatoes')).toBeTruthy();
  });
});

describe('BadgeGrid', () => {
  it('labels earned and locked badges distinctly', () => {
    const badges: Badge[] = [
      { food: 'flame', earned: true, label: 'Streak' },
      { food: 'fish', earned: false, label: 'Sea to table' },
    ];
    render(<BadgeGrid badges={badges} />);
    expect(screen.getByLabelText('Streak, earned')).toBeTruthy();
    expect(screen.getByLabelText('Sea to table, locked')).toBeTruthy();
  });
});

describe('Settings elements', () => {
  const items: SettingsItem[] = [
    { food: 'bread', label: 'Your name', onPress: jest.fn() },
    { food: 'flame', label: 'Reminders', onPress: jest.fn() },
  ];

  it('list rows fire onPress via their accessible label', () => {
    const onPress = jest.fn();
    render(<SettingsList items={[{ food: 'herb', label: 'Household', onPress }]} />);
    fireEvent.press(screen.getByLabelText('Household'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('tiles expose the label as their accessible name', () => {
    render(<SettingsTiles items={items} />);
    expect(screen.getByLabelText('Your name')).toBeTruthy();
    expect(screen.getByLabelText('Reminders')).toBeTruthy();
  });
});
