import { act, screen, userEvent, within } from '@testing-library/react-native';

import { useTheme } from '../index';
import { Text } from '../components/Text';
import { DesignPreview } from '../preview/DesignPreview';
import { renderUi, resetTheme } from './helpers';

afterEach(resetTheme);

function Scheme() {
  const { scheme } = useTheme();

  return <Text>{`scheme:${scheme}`}</Text>;
}

const SECTIONS = ['Appearance and language', 'Buttons', 'Inputs', 'Cards and rows', 'Feedback', 'Overlays'];

describe('DesignPreview', () => {
  it('shows every building block of the kit on one screen', async () => {
    await renderUi(<DesignPreview />);

    for (const title of SECTIONS) {
      expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
    }

    // Buttons
    for (const label of ['Primary', 'Accent', 'Ghost', 'Delete', 'Disabled']) {
      expect(screen.getAllByRole('button', { name: label }).length).toBeGreaterThan(0);
    }
    // Inputs: text field, phone field, one-time code
    expect(screen.getAllByLabelText('Full name').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Phone number')).toBeOnTheScreen();
    expect(screen.getByLabelText('Verification code')).toBeOnTheScreen();
    // Cards and rows
    expect(screen.getByText("Today's earnings")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Personal information' })).toBeOnTheScreen();
    expect(screen.getAllByLabelText(/^Ride payment/).length).toBe(2);
    for (const status of ['Verified', 'Pending', 'Rejected', 'Info', 'Draft']) {
      expect(screen.getByLabelText(status)).toBeOnTheScreen();
    }
    // Feedback
    expect(screen.getByRole('header', { name: 'No trips yet' })).toBeOnTheScreen();
    expect(screen.getByText('You are offline')).toBeOnTheScreen();
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    // Navigation
    expect(screen.getByRole('tab', { name: 'Home', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Earnings, 2 new' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Notifications, 3 unread' })).toBeOnTheScreen();
  });

  it('formats the sample money per language: dollars and cents, and whole drams with the dram sign', async () => {
    await renderUi(<DesignPreview />);

    expect(screen.getByText('$148.50')).toBeOnTheScreen();
    expect(screen.getByText('֏1,500', { exact: false })).toBeOnTheScreen();
  });

  it('switches to dark and back from the appearance picker', async () => {
    const user = userEvent.setup();
    await renderUi(
      <>
        <Scheme />
        <DesignPreview />
      </>,
    );
    expect(screen.getByText('scheme:light')).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Dark' }));
    expect(screen.getByText('scheme:dark')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Dark', checked: true })).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Light' }));
    expect(screen.getByText('scheme:light')).toBeOnTheScreen();
  });

  it('translates the whole screen when the language is changed, and back', async () => {
    const user = userEvent.setup();
    await renderUi(<DesignPreview />);

    await user.press(screen.getByRole('radio', { name: 'Русский' }));

    expect(screen.getByRole('header', { name: 'Кнопки' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Номер телефона')).toBeOnTheScreen();
    expect(screen.getByText('Заработок сегодня')).toBeOnTheScreen();
    expect(screen.queryByText('Buttons')).not.toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Հայերեն' }));
    expect(screen.getByRole('header', { name: 'Կոճակներ' })).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'English' }));
    expect(screen.getByRole('header', { name: 'Buttons' })).toBeOnTheScreen();
  });

  it('opens the bottom sheet and the dialog, and closes them again', async () => {
    const user = userEvent.setup();
    await renderUi(<DesignPreview />);

    await user.press(screen.getByRole('button', { name: 'Open the sheet' }));
    expect(screen.getByRole('header', { name: 'Choose a car type' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Choose a car type')).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Open the dialog' }));
    expect(screen.getByRole('header', { name: 'Cancel this ride?' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Keep the ride' }));
    expect(screen.queryByText('Cancel this ride?')).not.toBeOnTheScreen();
  });

  it('shows a toast, and the loading button works once then is free again', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderUi(<DesignPreview />);

    await user.press(screen.getByRole('button', { name: 'Show a message' }));
    expect(screen.getByText('Profile saved')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Submitting…' }));
    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeBusy();
    await user.press(screen.getByRole('button', { name: 'Submitting…' }));

    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('button', { name: 'Submitting…' })).not.toBeBusy();
    jest.useRealTimers();
  });

  it('lets the person fill the sample inputs: the phone field formats, the code fills its boxes', async () => {
    const user = userEvent.setup();
    await renderUi(<DesignPreview />);

    await user.type(screen.getByLabelText('Phone number'), '091234567');
    await user.type(screen.getByLabelText('Verification code'), '482913');
    await user.press(screen.getByRole('tab', { name: 'Profile' }));

    expect(screen.getByLabelText('Phone number').props.value).toBe('091 234567');
    expect(
      within(screen.getByLabelText('Verification code').parent!.parent!).getAllByText(/^\d$/, {
        includeHiddenElements: true,
      }),
    ).toHaveLength(6);
    expect(screen.getByRole('tab', { name: 'Profile', selected: true })).toBeOnTheScreen();
  });
});
