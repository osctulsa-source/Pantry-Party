import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { BrandTile } from './BrandTile';

describe('BrandTile', () => {
  it('renders its label and fires onPress', () => {
    const onPress = jest.fn();
    render(<BrandTile glyph="floursack" label="Flour" onPress={onPress} />);
    fireEvent.press(screen.getByText('Flour'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes selected state to accessibility and blocks presses when disabled', () => {
    const onPress = jest.fn();
    render(<BrandTile glyph="egg" label="Eggs" selected disabled onPress={onPress} />);
    const tile = screen.getByRole('button', { name: 'Eggs, added' });
    expect(tile.props.accessibilityState).toMatchObject({ selected: true, disabled: true });
    fireEvent.press(tile);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('corner accessory press does not trigger the body onPress', () => {
    const onPress = jest.fn();
    const onCorner = jest.fn();
    render(
      <BrandTile
        glyph="ricebowl"
        label="Rice"
        onPress={onPress}
        cornerAccessory={<Text onPress={onCorner}>refine</Text>}
      />,
    );
    fireEvent.press(screen.getByText('refine'));
    expect(onCorner).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });
});
