import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';

import { Button, type ButtonVariant } from '../components/Button';
import { renderUi, resetTheme } from './helpers';

afterEach(resetTheme);

describe('Button', () => {
  it.each<ButtonVariant>(['primary', 'accent', 'ghost', 'destructive'])(
    'shows its label and presses in the %s variant',
    async (variant) => {
      const user = userEvent.setup();
      const onPress = jest.fn();
      await renderUi(<Button label="Go online" variant={variant} onPress={onPress} />);

      await user.press(screen.getByRole('button', { name: 'Go online' }));

      expect(onPress).toHaveBeenCalledTimes(1);
    },
  );

  it('ignores taps while disabled and tells assistive technology so', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderUi(<Button label="Continue" disabled onPress={onPress} />);

    await user.press(screen.getByRole('button', { name: 'Continue' }));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('shows progress and ignores taps while loading', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderUi(<Button label="Save" loading onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Save' });

    await user.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
  });

  it('is not busy or disabled when idle', async () => {
    await renderUi(<Button label="Save" onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Save' })).not.toBeBusy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('sends the request once when tapped twice: it stays busy until the promise settles, then works again', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    const onPress = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    await renderUi(<Button label="Pay" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Pay' });

    await user.press(button);
    await user.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button).toBeBusy();

    await act(async () => finish());

    expect(button).not.toBeBusy();

    await user.press(button);
    expect(onPress).toHaveBeenCalledTimes(2);
    await act(async () => finish());
  });

  it('sends the request once when pressed twice in the same frame, before the busy state has rendered', async () => {
    const onPress = jest.fn(() => new Promise<void>(() => undefined));
    await renderUi(<Button label="Pay" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Pay' });

    act(() => {
      fireEvent.press(button);
      fireEvent.press(button);
    });

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('becomes usable again when the request fails, so the person can retry', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn(() => Promise.reject(new Error('network')));
    await renderUi(<Button label="Pay" onPress={onPress} />);

    // The caller owns error handling; the button only has to release itself. The rejection it receives is the caller's to report.
    await act(async () => {
      await user.press(screen.getByRole('button', { name: 'Pay' })).catch(() => undefined);
    });

    expect(screen.getByRole('button', { name: 'Pay' })).not.toBeBusy();
  });

  it('does nothing when pressed without a handler, and shows its icon and hint to assistive technology', async () => {
    const user = userEvent.setup();
    await renderUi(
      <Button label="Navigate" icon="navigation" accessibilityHint="Opens your maps app" size="sm" fullWidth />,
    );

    await user.press(screen.getByRole('button', { name: 'Navigate' }));

    expect(screen.getByRole('button', { name: 'Navigate' })).toBeEnabled();
    expect(screen.getByHintText('Opens your maps app')).toBeOnTheScreen();
  });
});
