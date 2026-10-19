import { act, screen, userEvent } from '@testing-library/react-native';
import { AccessibilityInfo, Animated } from 'react-native';

import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { renderUi, resetTheme } from './helpers';

afterEach(() => {
  resetTheme();
  jest.restoreAllMocks();
});

describe('EmptyState', () => {
  it('says what is empty and why it matters', async () => {
    await renderUi(<EmptyState title="No trips yet" message="Your completed trips will appear here." />);

    expect(screen.getByRole('header', { name: 'No trips yet' })).toBeOnTheScreen();
    expect(screen.getByText('Your completed trips will appear here.')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('offers the next step when there is one', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderUi(<EmptyState title="No trips yet" action={{ label: 'Book a ride', onPress }} />);

    await user.press(screen.getByRole('button', { name: 'Book a ride' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('ErrorState', () => {
  it('has a generic title, message and retry button in English', async () => {
    await renderUi(<ErrorState onRetry={() => undefined} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByText('Check your connection and try again.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('says the phone is offline in its own words', async () => {
    await renderUi(<ErrorState kind="offline" onRetry={() => undefined} />);

    expect(screen.getByRole('alert')).toHaveTextContent('You are offline');
    expect(screen.getByText('Reconnect to the internet and try again.')).toBeOnTheScreen();
  });

  it('prefers what the screen knows over the generic text', async () => {
    await renderUi(<ErrorState title="Could not load your trips" message="The server did not answer." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load your trips');
    expect(screen.getByText('The server did not answer.')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('retries once per tap and shows progress until the retry finishes', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    const onRetry = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    await renderUi(<ErrorState onRetry={onRetry} />);
    const retry = screen.getByRole('button', { name: 'Try again' });

    await user.press(retry);
    await user.press(retry);

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(retry).toBeBusy();

    await act(async () => finish());
    expect(retry).not.toBeBusy();
  });

  it('is in Russian for a Russian user', async () => {
    await renderUi(<ErrorState kind="offline" onRetry={() => undefined} />, { saved: { locale: 'ru' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Нет подключения к интернету');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeOnTheScreen();
  });
});

describe('Skeleton', () => {
  it('is invisible to screen readers by default, so a page of placeholders is not read out', async () => {
    await renderUi(<Skeleton className="h-4 w-40" />);

    expect(screen.toJSON()).not.toBeNull();
    expect(screen.queryByLabelText('Loading')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('announces itself as busy when it has a label', async () => {
    await renderUi(<Skeleton className="h-24" label="Loading" />);

    expect(screen.getByLabelText('Loading')).toBeBusy();
  });

  it('holds still for people who turned animations off, and animates for everyone else', async () => {
    const loop = jest.spyOn(Animated, 'loop');
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { unmount } = await renderUi(<Skeleton className="h-4" />);
    await act(async () => undefined);
    expect(loop).not.toHaveBeenCalled();
    unmount();

    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    await renderUi(<Skeleton className="h-4" />);
    await act(async () => undefined);
    expect(loop).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
