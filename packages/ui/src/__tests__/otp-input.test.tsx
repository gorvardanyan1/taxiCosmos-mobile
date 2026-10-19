import { screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { OtpInput } from '../components/OtpInput';
import { renderUi, resetTheme } from './helpers';

afterEach(resetTheme);

function Harness({
  onComplete,
  error,
  length,
}: {
  onComplete?: (code: string) => void;
  error?: string;
  length?: number;
}) {
  const [value, setValue] = useState('');

  return <OtpInput value={value} onChange={setValue} onComplete={onComplete} error={error} length={length} />;
}

describe('OtpInput', () => {
  it('has an accessible name and hint, and asks the keyboard and the SMS auto-fill for a one-time code', async () => {
    await renderUi(<Harness />);
    const input = screen.getByLabelText('Verification code');

    expect(screen.getByHintText('Enter the 6-digit code')).toBeOnTheScreen();
    expect(input.props.textContentType).toBe('oneTimeCode');
    expect(input.props.autoComplete).toBe('sms-otp');
    expect(input.props.keyboardType).toBe('number-pad');
  });

  it('shows each digit typed in its own box', async () => {
    const user = userEvent.setup();
    await renderUi(<Harness />);

    await user.type(screen.getByLabelText('Verification code'), '123');

    // The boxes only draw what the hidden input holds, so assistive technology reads the input, not six boxes.
    for (const digit of ['1', '2', '3']) {
      expect(screen.getByText(digit, { includeHiddenElements: true })).toBeOnTheScreen();
    }
    expect(screen.queryByText('4', { includeHiddenElements: true })).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Verification code').props.value).toBe('123');
  });

  it('keeps only digits: letters, spaces and dashes are dropped', async () => {
    const user = userEvent.setup();
    await renderUi(<Harness />);

    await user.type(screen.getByLabelText('Verification code'), '1a2 3-b');

    expect(screen.getByLabelText('Verification code').props.value).toBe('123');
  });

  it('calls onComplete exactly once, with the whole code, when the last digit arrives', async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn();
    await renderUi(<Harness onComplete={onComplete} />);

    await user.type(screen.getByLabelText('Verification code'), '12345');
    expect(onComplete).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Verification code'), '6');

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('takes a pasted or auto-filled code with a space in it, and never accepts more digits than the length', async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn();
    await renderUi(<Harness onComplete={onComplete} />);

    await user.paste(screen.getByLabelText('Verification code'), '123 456789');

    expect(screen.getByLabelText('Verification code').props.value).toBe('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('does not call onComplete again when more digits are typed after the code is full', async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn();
    await renderUi(<Harness onComplete={onComplete} />);

    await user.type(screen.getByLabelText('Verification code'), '1234567');

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Verification code').props.value).toBe('123456');
  });

  it('cuts a pasted code to the configured length, not the default', async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn();
    await renderUi(<Harness length={4} onComplete={onComplete} />);

    await user.paste(screen.getByLabelText('Verification code'), '987654');

    expect(screen.getByLabelText('Verification code').props.value).toBe('9876');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('9876');
  });

  it('works for another code length', async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn();
    await renderUi(<Harness length={4} onComplete={onComplete} />);

    await user.type(screen.getByLabelText('Verification code'), '98765');

    expect(onComplete).toHaveBeenCalledWith('9876');
    expect(screen.getByHintText('Enter the 4-digit code')).toBeOnTheScreen();
  });

  it('shows what is wrong with the code, and reads it out instead of the hint', async () => {
    await renderUi(<Harness error="That code is wrong" />);

    expect(screen.getByRole('alert')).toHaveTextContent('That code is wrong');
    expect(screen.getByHintText('That code is wrong')).toBeOnTheScreen();
  });

  it('cannot be typed into while a code is being checked', async () => {
    const onChange = jest.fn();
    await renderUi(<OtpInput value="123456" onChange={onChange} editable={false} />);

    expect(screen.getByLabelText('Verification code')).not.toBeEnabled();
  });

  it('is in Armenian for an Armenian user', async () => {
    await renderUi(<Harness />, { saved: { locale: 'hy' } });

    expect(screen.getByLabelText('Հաստատման կոդ')).toBeOnTheScreen();
    expect(screen.getByHintText('Մուտքագրեք 6 նիշանոց կոդը')).toBeOnTheScreen();
  });
});
