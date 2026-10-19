import { screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { TabBar, type TabItem } from '../components/TabBar';
import { renderUi, resetTheme } from './helpers';

afterEach(resetTheme);

const TABS: TabItem[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'earnings', label: 'Earnings', icon: 'wallet' },
  { id: 'profile', label: 'Profile', icon: 'user' },
];

function Harness({ tabs = TABS, onChange }: { tabs?: TabItem[]; onChange?: (id: string) => void }) {
  const [active, setActive] = useState('home');

  return (
    <TabBar
      tabs={tabs}
      active={active}
      onChange={(id) => {
        setActive(id);
        onChange?.(id);
      }}
    />
  );
}

describe('TabBar', () => {
  it('lists the tabs under a named tab list and marks only the active one as selected', async () => {
    await renderUi(<Harness />);

    // The container is deliberately not an accessibility element itself, so screen readers still reach every tab inside it.
    expect(screen.getByLabelText('Main navigation').props.accessibilityRole).toBe('tablist');
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'Home', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Earnings', selected: false })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Profile', selected: false })).toBeOnTheScreen();
  });

  it('selects the tab that was tapped and tells the screen which one', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderUi(<Harness onChange={onChange} />);

    await user.press(screen.getByRole('tab', { name: 'Earnings' }));

    expect(onChange).toHaveBeenCalledWith('earnings');
    expect(screen.getByRole('tab', { name: 'Earnings', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Home', selected: false })).toBeOnTheScreen();
  });

  it('shows a count badge and reads it out with the label; the count is capped at 99+', async () => {
    await renderUi(
      <Harness
        tabs={[
          { id: 'home', label: 'Home', icon: 'home' },
          { id: 'earnings', label: 'Earnings', icon: 'wallet', badge: 2 },
          { id: 'profile', label: 'Profile', icon: 'user', badge: 150 },
        ]}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Earnings, 2 new' })).toBeOnTheScreen();
    expect(screen.getByText('2')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Profile, 150 new' })).toBeOnTheScreen();
    expect(screen.getByText('99+')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Home' })).toBeOnTheScreen();
  });

  it('draws no badge for a zero count', async () => {
    await renderUi(<Harness tabs={[{ id: 'home', label: 'Home', icon: 'home', badge: 0 }]} />);

    expect(screen.queryByText('0')).not.toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Home' })).toBeOnTheScreen();
  });

  it('draws no badge for a negative count either', async () => {
    await renderUi(<Harness tabs={[{ id: 'home', label: 'Home', icon: 'home', badge: -3 }]} />);

    expect(screen.queryByText('-3')).not.toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Home' })).toBeOnTheScreen();
  });

  it('uses the right Russian plural for the badge announcement', async () => {
    await renderUi(
      <Harness
        tabs={[
          { id: 'a', label: 'Доход', icon: 'wallet', badge: 1 },
          { id: 'b', label: 'Профиль', icon: 'user', badge: 3 },
          { id: 'c', label: 'Главная', icon: 'home', badge: 5 },
        ]}
      />,
      { saved: { locale: 'ru' } },
    );

    expect(screen.getByRole('tab', { name: 'Доход, 1 новое' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Профиль, 3 новых' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Главная, 5 новых' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Главная навигация')).toBeOnTheScreen();
  });
});
