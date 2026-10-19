import { act, render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { Modal as NativeModal } from 'react-native';

import { BottomSheet } from '../components/BottomSheet';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Toast, useToast } from '../components/Toast';
import { renderUi, resetTheme } from './helpers';

afterEach(() => {
  resetTheme();
  jest.useRealTimers();
});

function SheetHarness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button label="Open" onPress={() => setOpen(true)} />
      <BottomSheet
        visible={open}
        title="Choose a car type"
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
      >
        <Button label="Economy" />
      </BottomSheet>
    </>
  );
}

describe('BottomSheet', () => {
  it('is not on screen until opened, then shows its title and content', async () => {
    const user = userEvent.setup();
    await renderUi(<SheetHarness />);
    expect(screen.queryByText('Choose a car type')).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Open' }));

    expect(screen.getByRole('header', { name: 'Choose a car type' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Economy' })).toBeOnTheScreen();
  });

  it('closes from the close button', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    await renderUi(<SheetHarness onClose={onClose} />);
    await user.press(screen.getByRole('button', { name: 'Open' }));

    await user.press(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Choose a car type')).not.toBeOnTheScreen();
  });

  it('closes when the dimmed area outside is tapped', async () => {
    const user = userEvent.setup();
    await renderUi(<SheetHarness />);
    await user.press(screen.getByRole('button', { name: 'Open' }));

    // The dimmed backdrop is hidden from screen readers while the sheet is up (the close button is their way out), but a finger can tap it.
    const outside = screen.getAllByLabelText('Close', { includeHiddenElements: true });
    expect(outside).toHaveLength(2);
    await user.press(outside[0]!);

    expect(screen.queryByText('Choose a car type')).not.toBeOnTheScreen();
  });

  it('closes on the Android back button', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    await renderUi(<SheetHarness onClose={onClose} />);
    await user.press(screen.getByRole('button', { name: 'Open' }));

    // The native Modal reports the Android back button as `onRequestClose`.
    act(() => screen.UNSAFE_getByType(NativeModal).props.onRequestClose());

    expect(onClose).toHaveBeenCalled();
  });

  it('labels its close controls in the language of the person', async () => {
    const user = userEvent.setup();
    await renderUi(<SheetHarness />, { saved: { locale: 'ru' } });
    await user.press(screen.getByRole('button', { name: 'Open' }));

    expect(screen.getAllByLabelText('Закрыть', { includeHiddenElements: true })).toHaveLength(2);
  });
});

function ModalHarness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(true);

  return (
    <Modal
      visible={open}
      title="Cancel this ride?"
      message="The driver is already on the way."
      onClose={() => setOpen(false)}
      actions={
        <>
          <Button label="Cancel ride" variant="destructive" onPress={onConfirm} />
          <Button label="Keep the ride" variant="ghost" onPress={() => setOpen(false)} />
        </>
      }
    />
  );
}

describe('Modal', () => {
  it('asks the question with a title, a message and its actions', async () => {
    await renderUi(<ModalHarness onConfirm={jest.fn()} />);

    expect(screen.getByRole('header', { name: 'Cancel this ride?' })).toBeOnTheScreen();
    expect(screen.getByText('The driver is already on the way.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cancel ride' })).toBeOnTheScreen();
  });

  it('runs the confirming action', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    await renderUi(<ModalHarness onConfirm={onConfirm} />);

    await user.press(screen.getByRole('button', { name: 'Cancel ride' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes without confirming when the person keeps the ride or taps outside', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    await renderUi(<ModalHarness onConfirm={onConfirm} />);

    await user.press(screen.getByRole('button', { name: 'Keep the ride' }));

    expect(screen.queryByText('Cancel this ride?')).not.toBeOnTheScreen();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closes when the dimmed area is tapped', async () => {
    const user = userEvent.setup();
    await renderUi(<ModalHarness onConfirm={jest.fn()} />);

    await user.press(screen.getByLabelText('Close', { includeHiddenElements: true }));

    expect(screen.queryByText('Cancel this ride?')).not.toBeOnTheScreen();
  });

  it('closes on the Android back button', async () => {
    const onClose = jest.fn();
    await renderUi(<Modal visible title="Cancel this ride?" onClose={onClose} />);

    // The native Modal reports the Android back button as `onRequestClose`.
    act(() => screen.UNSAFE_getByType(NativeModal).props.onRequestClose());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('can hold extra content and needs no message or actions', async () => {
    await renderUi(
      <Modal visible title="Rate your driver" onClose={jest.fn()}>
        <Button label="Five stars" />
      </Modal>,
    );

    expect(screen.getByRole('button', { name: 'Five stars' })).toBeOnTheScreen();
  });
});

function ToastHarness() {
  const toast = useToast();

  return (
    <>
      <Button label="Saved" onPress={() => toast.show({ message: 'Profile saved', tone: 'success' })} />
      <Button label="Failed" onPress={() => toast.show({ message: 'Could not save', tone: 'error', duration: 1000 })} />
      <Button label="Hide" onPress={toast.dismiss} />
    </>
  );
}

describe('Toast', () => {
  it('announces a message as an alert and disappears by itself after four seconds', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderUi(<ToastHarness />);

    await user.press(screen.getByRole('button', { name: 'Saved' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Profile saved');

    act(() => jest.advanceTimersByTime(3999));
    expect(screen.getByText('Profile saved')).toBeOnTheScreen();

    act(() => jest.advanceTimersByTime(1));
    expect(screen.queryByText('Profile saved')).not.toBeOnTheScreen();
  });

  it('replaces the old message with the new one and restarts the clock', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderUi(<ToastHarness />);

    await user.press(screen.getByRole('button', { name: 'Saved' }));
    act(() => jest.advanceTimersByTime(3000));
    await user.press(screen.getByRole('button', { name: 'Failed' }));

    expect(screen.queryByText('Profile saved')).not.toBeOnTheScreen();
    expect(screen.getByText('Could not save')).toBeOnTheScreen();

    // The first toast's timer (1s left) must not hide the second one early; the second lasts its own 1000 ms.
    act(() => jest.advanceTimersByTime(999));
    expect(screen.getByText('Could not save')).toBeOnTheScreen();
    act(() => jest.advanceTimersByTime(1));
    expect(screen.queryByText('Could not save')).not.toBeOnTheScreen();
  });

  it('can be dismissed with its close button, or from code', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderUi(<ToastHarness />);

    await user.press(screen.getByRole('button', { name: 'Saved' }));
    await user.press(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Profile saved')).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Failed' }));
    await user.press(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByText('Could not save')).not.toBeOnTheScreen();
  });

  it('shows a plain toast without a close button when it is only displayed', async () => {
    await renderUi(<Toast message="Offline" tone="neutral" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Offline');
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeOnTheScreen();
  });

  it('is refused outside the UI provider, with a message saying what to do', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<ToastHarness />)).toThrow('useToast must be used inside <UiProvider>.');
    consoleError.mockRestore();
  });
});
