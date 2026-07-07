import { fireEvent, render, screen } from '@testing-library/react-native';

import { Body, Button } from './ui';

// These primitives depend only on React Native core + the theme tokens (no
// navigation / PowerSync / icons), so they render under the jest-expo preset
// with no extra native mocks — a good smoke test that the mobile test harness
// itself works end to end.

describe('Button', () => {
  it('renders its title', () => {
    render(<Button title="Add item" onPress={() => {}} />);
    expect(screen.getByText('Add item')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    render(<Button title="Save" onPress={onPress} />);
    fireEvent.press(screen.getByText('Save'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    render(<Button title="Blocked" onPress={onPress} disabled />);
    fireEvent.press(screen.getByText('Blocked'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Body', () => {
  it('renders its text content', () => {
    render(<Body>Hello pantry</Body>);
    expect(screen.getByText('Hello pantry')).toBeTruthy();
  });
});
