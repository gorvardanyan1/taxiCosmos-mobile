import { act, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { LoadingScreen } from '../components/LoadingScreen';
import { StatusScreen } from '../components/StatusScreen';
import { renderUi, resetTheme } from './helpers';

afterEach(() => {
  resetTheme();
  jest.restoreAllMocks();
});

describe('StatusScreen', () => {
  it('says one thing and offers the ways out', async () => {
    const user = userEvent.setup();
    const primary = jest.fn();
    const secondary = jest.fn();
    await renderUi(
      <StatusScreen
        icon="shield"
        tone="danger"
        title="Account suspended"
        message="Contact support."
        primaryAction={{ label: 'Email help@x.test', onPress: primary }}
        secondaryAction={{ label: 'Sign out', onPress: secondary }}
      >
        <Text>extra content</Text>
      </StatusScreen>,
    );

    expect(screen.getByRole('header', { name: 'Account suspended' })).toBeOnTheScreen();
    expect(screen.getByText('Contact support.')).toBeOnTheScreen();
    expect(screen.getByText('extra content')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Email help@x.test' }));
    await user.press(screen.getByRole('button', { name: 'Sign out' }));

    expect(primary).toHaveBeenCalledTimes(1);
    expect(secondary).toHaveBeenCalledTimes(1);
  });

  it('can be only a message, with no buttons', async () => {
    await renderUi(<StatusScreen icon="route" title="Page not found" />);

    expect(screen.getByRole('header', { name: 'Page not found' })).toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('presses an action only once when it is tapped twice while it is working', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    const onPress = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    await renderUi(<StatusScreen icon="alert" title="Oops" primaryAction={{ label: 'Try again', onPress }} />);
    const button = screen.getByRole('button', { name: 'Try again' });

    await user.press(button);
    await user.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);

    await act(async () => finish());
  });
});

describe('LoadingScreen', () => {
  it('tells screen readers the app is loading', async () => {
    await renderUi(<LoadingScreen />);

    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeOnTheScreen();
  });

  it('speaks the language of the person', async () => {
    await renderUi(<LoadingScreen />, { saved: { locale: 'ru' } });

    expect(screen.getByRole('progressbar', { name: 'Загрузка' })).toBeOnTheScreen();
  });
});

describe('AppErrorBoundary', () => {
  // React logs every caught render error; the tests expect them, so the noise is silenced (the logging itself is not under test).
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));

  function Bomb({ fail }: { fail: { now: boolean; message?: string } }) {
    if (fail.now) {
      throw new Error(fail.message ?? 'screen exploded');
    }

    return <Text>screen is fine</Text>;
  }

  it('shows the screens untouched while nothing goes wrong', async () => {
    const onError = jest.fn();
    await renderUi(
      <AppErrorBoundary onError={onError}>
        <Bomb fail={{ now: false }} />
      </AppErrorBoundary>,
    );

    expect(screen.getByText('screen is fine')).toBeOnTheScreen();
    expect(onError).not.toHaveBeenCalled();
  });

  it('catches an error thrown deep in a screen, reports it once and shows a screen to recover from', async () => {
    const onError = jest.fn();
    await renderUi(
      <AppErrorBoundary onError={onError}>
        <Text>header</Text>
        <Bomb fail={{ now: true }} />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeOnTheScreen();
    expect(screen.queryByText('header')).not.toBeOnTheScreen();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ message: 'screen exploded' }));
    expect(onError.mock.calls[0]?.[1]).toEqual(expect.stringContaining('AppErrorBoundary'));
  });

  it('draws the screens again from scratch on "Try again", without restarting the app', async () => {
    const user = userEvent.setup();
    const fail = { now: true };
    const onError = jest.fn();
    await renderUi(
      <AppErrorBoundary onError={onError}>
        <Bomb fail={fail} />
      </AppErrorBoundary>,
    );
    fail.now = false;

    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('screen is fine')).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Something went wrong' })).not.toBeOnTheScreen();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('stays on the recovery screen, and reports again, when the retry fails the same way', async () => {
    const user = userEvent.setup();
    const onError = jest.fn();
    await renderUi(
      <AppErrorBoundary onError={onError}>
        <Bomb fail={{ now: true }} />
      </AppErrorBoundary>,
    );

    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeOnTheScreen();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('still shows the recovery screen when reporting the error fails', async () => {
    const onError = jest.fn(() => {
      throw new Error('Sentry is down');
    });
    await renderUi(
      <AppErrorBoundary onError={onError}>
        <Bomb fail={{ now: true }} />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeOnTheScreen();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('copes with something that is not an Error being thrown', async () => {
    const onError = jest.fn();
    function Thrower(): never {
      throw 'a plain string';
    }
    await renderUi(
      <AppErrorBoundary onError={onError}>
        <Thrower />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeOnTheScreen();
  });

  it('works without a reporter', async () => {
    await renderUi(
      <AppErrorBoundary>
        <Bomb fail={{ now: true }} />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeOnTheScreen();
  });

  it('speaks the language of the person', async () => {
    await renderUi(
      <AppErrorBoundary>
        <Bomb fail={{ now: true }} />
      </AppErrorBoundary>,
      { saved: { locale: 'hy' } },
    );

    expect(screen.getByRole('header', { name: 'Ինչ-որ բան այնպես չգնաց' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Կրկին փորձել' })).toBeOnTheScreen();
  });
});
