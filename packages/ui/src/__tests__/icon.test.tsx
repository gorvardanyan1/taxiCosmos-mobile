import { screen } from '@testing-library/react-native';
import { Svg } from 'react-native-svg';

import { IconButton } from '../components/IconButton';
import { Icon, ICONS } from '../icons/Icon';
import { renderUi, resetTheme } from './helpers';

afterEach(resetTheme);

describe('Icon', () => {
  it('is decoration: hidden from screen readers, so only the label next to it is read', async () => {
    await renderUi(<IconButton icon="bell" label="Notifications" />);

    // The button is found by its label...
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeOnTheScreen();
    // ...and the drawing inside it is not an accessibility element of its own.
    const svg = screen.getByRole('button', { name: 'Notifications' }).findByType(Svg);
    expect(svg.props.accessibilityElementsHidden).toBe(true);
    expect(svg.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('draws every icon of the set without needing a label', async () => {
    await renderUi(
      <>
        {Object.keys(ICONS).map((name) => (
          <Icon key={name} name={name as keyof typeof ICONS} filled />
        ))}
      </>,
    );

    expect(screen.UNSAFE_getAllByType(Svg)).toHaveLength(Object.keys(ICONS).length);
  });
});
