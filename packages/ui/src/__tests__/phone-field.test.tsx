import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { PhoneField, type PhoneFieldChange } from '../components/PhoneField';
import type { CountryCode } from '@taxikosmos/core';
import { renderUi, resetTheme } from './helpers';

afterEach(resetTheme);

function Harness({ onChange, error }: { onChange?: (change: PhoneFieldChange) => void; error?: string }) {
  const [value, setValue] = useState('');
  const [country, setCountry] = useState<CountryCode>('AM');

  return (
    <PhoneField
      value={value}
      country={country}
      error={error}
      onChange={(change) => {
        setValue(change.text);
        setCountry(change.country);
        onChange?.(change);
      }}
    />
  );
}

describe('PhoneField', () => {
  it('defaults to Armenia (+374) and labels the field', async () => {
    await renderUi(<Harness />);

    expect(screen.getByLabelText('Phone number')).toBeOnTheScreen();
    expect(screen.getByText('+374')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Country Armenia, code +374' })).toBeOnTheScreen();
  });

  it('asks the keyboard for a phone pad and the system to offer the saved phone number', async () => {
    await renderUi(<Harness />);
    const input = screen.getByLabelText('Phone number');

    expect(input.props.keyboardType).toBe('phone-pad');
    expect(input.props.textContentType).toBe('telephoneNumber');
    expect(input.props.autoComplete).toBe('tel');
  });

  it('formats while typing and reports the E.164 number only once it is complete', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderUi(<Harness onChange={onChange} />);
    const field = screen.getByLabelText('Phone number');

    await user.type(field, '091234');
    expect(onChange).toHaveBeenLastCalledWith({ text: '091 234', country: 'AM', e164: null, valid: false });

    await user.type(field, '567');
    expect(onChange).toHaveBeenLastCalledWith({ text: '091 234567', country: 'AM', e164: '+37491234567', valid: true });
    expect(field.props.value).toBe('091 234567');
  });

  it('stays quiet while the person types, names the problem once they leave an incomplete number, and clears it when they fix it', async () => {
    const user = userEvent.setup();
    await renderUi(<Harness />);
    const field = screen.getByLabelText('Phone number');

    await user.type(field, '091 23', { skipBlur: true });
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();

    fireEvent(field, 'blur');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid phone number');

    await user.type(field, '4567', { skipBlur: true });
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(field.props.value).toBe('091 234567');

    fireEvent(field, 'blur');
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('never shows the invalid message for an empty field', async () => {
    const user = userEvent.setup();
    await renderUi(<Harness />);

    await user.type(screen.getByLabelText('Phone number'), 'a');
    await user.clear(screen.getByLabelText('Phone number'));

    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('shows a message from the server instead of its own check', async () => {
    await renderUi(<Harness error="This number is blocked" />);

    expect(screen.getByRole('alert')).toHaveTextContent('This number is blocked');
  });

  it('shows the server message rather than its own invalid message when both apply', async () => {
    const user = userEvent.setup();
    await renderUi(<Harness error="This number is blocked" />);

    await user.type(screen.getByLabelText('Phone number'), '091 23');

    expect(screen.getByRole('alert')).toHaveTextContent('This number is blocked');
    expect(screen.queryByText('Enter a valid phone number')).not.toBeOnTheScreen();
  });

  it('changes the country from the picker, keeps the digits typed, and reports the new country', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderUi(<Harness onChange={onChange} />);

    await user.type(screen.getByLabelText('Phone number'), '9123456789', { skipBlur: true });
    await user.press(screen.getByRole('button', { name: 'Country Armenia, code +374' }));

    expect(await screen.findByText('Select country')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Country Armenia, code +374', selected: true })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Country Russia, code +7' }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ country: 'RU', e164: '+79123456789', valid: true }),
    );
    expect(screen.getByText('+7')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Country Russia, code +7' })).toBeOnTheScreen();
  });

  it('can be locked while a request is running', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderUi(<PhoneField value="091 234567" country="AM" onChange={onChange} editable={false} />);

    await user.press(screen.getByRole('button', { name: 'Country Armenia, code +374' }));

    expect(screen.queryByText('Select country')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Phone number')).not.toBeEnabled();
  });

  it('speaks the language of the person: the labels and country names are Russian', async () => {
    await renderUi(<Harness />, { saved: { locale: 'ru' } });

    expect(screen.getByLabelText('Номер телефона')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Страна Армения, код +374' })).toBeOnTheScreen();
  });
});
