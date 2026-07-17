import { render } from '@testing-library/react-native';

import { TechniqueGlyph } from './TechniqueGlyph';

describe('TechniqueGlyph', () => {
  it('renders an animated technique glyph without throwing', () => {
    const { unmount } = render(<TechniqueGlyph name="chop" />);
    unmount();
  });

  it('renders a zero-layer stage glyph without throwing', () => {
    const { unmount } = render(<TechniqueGlyph name="prep" />);
    unmount();
  });
});
