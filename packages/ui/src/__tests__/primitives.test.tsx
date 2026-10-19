import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { Text as NativeText } from 'react-native';

import { Card } from '../components/Card';
import { DarkStatCard } from '../components/DarkStatCard';
import { IconButton } from '../components/IconButton';
import { ListGroup } from '../components/ListGroup';
import { ListRow } from '../components/ListRow';
import { MenuRow } from '../components/MenuRow';
import { NotificationBell, ScreenHeader, ThemeToggleButton } from '../components/ScreenHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusBadge } from '../components/StatusBadge';
import { TextField } from '../components/TextField';
import { renderUi, resetTheme } from './helpers';

afterEach(resetTheme);

describe('IconButton', () => {
  it('is named by its label (an icon alone says nothing) and presses', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderUi(
      <IconButton icon="settings" label="Settings" onPress={onPress} accessibilityHint="Opens settings" />,
    );

    await user.press(screen.getByRole('button', { name: 'Settings' }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByHintText('Opens settings')).toBeOnTheScreen();
  });
});

describe('ScreenHeader', () => {
  it('shows the eyebrow, the title as a heading, the avatar and the action buttons', async () => {
    await renderUi(
      <ScreenHeader
        title="Good morning, Alex"
        subtitle="Monday, June 24"
        leading={<NativeText>AM</NativeText>}
        actions={
          <>
            <ThemeToggleButton />
            <NotificationBell unread={3} />
          </>
        }
      />,
    );

    expect(screen.getByRole('header', { name: 'Good morning, Alex' })).toBeOnTheScreen();
    expect(screen.getByText('Monday, June 24')).toBeOnTheScreen();
    expect(screen.getByText('AM')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Notifications, 3 unread' })).toBeOnTheScreen();
  });

  it('works with just a title', async () => {
    await renderUi(<ScreenHeader title="My profile" />);

    expect(screen.getByRole('header', { name: 'My profile' })).toBeOnTheScreen();
  });

  it('says there is nothing unread when there is nothing, and reads the Russian plural when there is', async () => {
    const view = await renderUi(<NotificationBell />);
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeOnTheScreen();
    view.unmount();

    await renderUi(<NotificationBell unread={2} />, { saved: { locale: 'ru' } });
    expect(screen.getByRole('button', { name: 'Уведомления, 2 непрочитанных' })).toBeOnTheScreen();
  });

  it('presses the bell', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderUi(<NotificationBell unread={1} onPress={onPress} />);

    await user.press(screen.getByRole('button', { name: 'Notifications, 1 unread' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('TextField', () => {
  function Harness({ error, hint }: { error?: string; hint?: string }) {
    const [value, setValue] = useState('');

    return <TextField label="Full name" value={value} onChangeText={setValue} error={error} hint={hint} />;
  }

  it('is labelled, takes typing and keeps what was typed', async () => {
    const user = userEvent.setup();
    await renderUi(<Harness />);

    await user.type(screen.getByLabelText('Full name'), 'Alex Morgan');

    expect(screen.getByLabelText('Full name').props.value).toBe('Alex Morgan');
  });

  it('shows help under the field and reads it as a hint', async () => {
    await renderUi(<Harness hint="As on your documents" />);

    expect(screen.getByText('As on your documents')).toBeOnTheScreen();
    expect(screen.getByHintText('As on your documents')).toBeOnTheScreen();
  });

  it('shows the error in place of the help, announces it, and reads it instead of the hint', async () => {
    await renderUi(<Harness hint="As on your documents" error="Enter your name" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your name');
    expect(screen.queryByText('As on your documents')).not.toBeOnTheScreen();
    expect(screen.getByHintText('Enter your name')).toBeOnTheScreen();
  });

  it('passes focus and blur to the caller', async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await renderUi(<TextField label="Name" value="" onFocus={onFocus} onBlur={onBlur} />);
    const field = screen.getByLabelText('Name');

    fireEvent(field, 'focus');
    fireEvent(field, 'blur');

    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('can be locked while a request runs', async () => {
    await renderUi(<TextField label="Name" value="Alex" editable={false} />);

    expect(screen.getByLabelText('Name')).not.toBeEnabled();
  });
});

describe('MenuRow and ListGroup', () => {
  it('lists rows that press, show the current value and read as one control', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderUi(
      <ListGroup>
        <MenuRow label="Personal information" icon="user" onPress={onPress} />
        <MenuRow label="Language" icon="globe" value="English" onPress={jest.fn()} />
        <MenuRow label="Sign out" icon="arrow" destructive onPress={jest.fn()} />
      </ListGroup>,
    );

    await user.press(screen.getByRole('button', { name: 'Personal information' }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Language, English' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeOnTheScreen();
  });

  it('draws nothing for a row that is not there', async () => {
    await renderUi(
      <ListGroup>
        <MenuRow label="Help center" icon="help" onPress={jest.fn()} />
        {false}
        {null}
      </ListGroup>,
    );

    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('ListRow', () => {
  it('reads title, subtitle and amount together, and is not a button when it does nothing', async () => {
    await renderUi(
      <ListRow icon="route" title="Ride payment" subtitle="Today, 10:42" trailing="+$24.80" trailingTone="positive" />,
    );

    expect(screen.getByLabelText('Ride payment, Today, 10:42, +$24.80')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('becomes a button when it has somewhere to go', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderUi(<ListRow title="Fuel station" trailing="−$42.00" onPress={onPress} />);

    await user.press(screen.getByRole('button', { name: 'Fuel station, −$42.00' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('StatusBadge', () => {
  it.each(['neutral', 'success', 'warning', 'danger', 'info', 'accent'] as const)(
    'says its state in words in the %s tone',
    async (tone) => {
      await renderUi(<StatusBadge tone={tone} label="Verified" />);

      expect(screen.getByLabelText('Verified')).toBeOnTheScreen();
      expect(screen.getByText('Verified')).toBeOnTheScreen();
    },
  );
});

describe('Card and DarkStatCard', () => {
  it('Card holds its children in both variants', async () => {
    await renderUi(
      <>
        <Card>
          <NativeText>raised</NativeText>
        </Card>
        <Card variant="outlined">
          <NativeText>outlined</NativeText>
        </Card>
      </>,
    );

    expect(screen.getByText('raised')).toBeOnTheScreen();
    expect(screen.getByText('outlined')).toBeOnTheScreen();
  });

  it('DarkStatCard shows the figure, the goal box, the progress and the three stats', async () => {
    await renderUi(
      <DarkStatCard
        label="Today's earnings"
        value="$148.50"
        aside={{ label: 'Goal', value: '74%' }}
        progress={74}
        stats={[
          { icon: 'clock', value: '5h 24m', label: 'Online' },
          { icon: 'route', value: '12', label: 'Trips' },
        ]}
      />,
    );

    expect(screen.getByText("Today's earnings")).toBeOnTheScreen();
    expect(screen.getByText('$148.50')).toBeOnTheScreen();
    expect(screen.getByText('Goal')).toBeOnTheScreen();
    expect(screen.getByText('74%')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'Goal' })).toHaveAccessibilityValue({ min: 0, max: 100, now: 74 });
    expect(screen.getByLabelText('Online: 5h 24m')).toBeOnTheScreen();
    expect(screen.getByLabelText('Trips: 12')).toBeOnTheScreen();
  });

  it('DarkStatCard keeps progress between 0 and 100 and works with only a label and a value', async () => {
    const view = await renderUi(<DarkStatCard label="Balance" value="$0.00" progress={180} />);
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ min: 0, max: 100, now: 100 });
    view.unmount();

    const second = await renderUi(<DarkStatCard label="Balance" value="$0.00" progress={-5} stats={[]} />);
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ min: 0, max: 100, now: 0 });
    second.unmount();

    await renderUi(<DarkStatCard label="Plain" value="$1.00" />);
    expect(screen.getByText('$1.00')).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).not.toBeOnTheScreen();
  });
});

describe('SegmentedControl', () => {
  function Harness({ onChange }: { onChange?: (value: string) => void }) {
    const [value, setValue] = useState('system');

    return (
      <SegmentedControl
        label="Appearance"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
    );
  }

  it('is a named radio group with exactly one option checked', async () => {
    await renderUi(<Harness />);

    expect(screen.getByLabelText('Appearance').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByRole('radio', { name: 'System', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Light', checked: false })).toBeOnTheScreen();
  });

  it('moves the check to the option tapped and reports it', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderUi(<Harness onChange={onChange} />);

    await user.press(screen.getByRole('radio', { name: 'Dark' }));

    expect(onChange).toHaveBeenCalledWith('dark');
    expect(screen.getByRole('radio', { name: 'Dark', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'System', checked: false })).toBeOnTheScreen();
  });
});
