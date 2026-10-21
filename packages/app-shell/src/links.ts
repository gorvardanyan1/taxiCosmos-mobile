import { Linking } from 'react-native';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A store link the server sent: only `https` is opened, whatever the server (or someone in between) says. */
export function storeLink(url: string | null): string | null {
  return url !== null && /^https:\/\/[^\s]+$/i.test(url) ? url : null;
}

export function mailLink(email: string | null): string | null {
  return email !== null && EMAIL.test(email) ? `mailto:${email}` : null;
}

/** `tel:` with digits and a leading plus only, so a malformed number cannot smuggle anything into the link. */
export function telLink(phone: string | null): string | null {
  const digits = phone?.replace(/[^\d+]/g, '') ?? '';

  return /^\+?\d{5,16}$/.test(digits) ? `tel:${digits}` : null;
}

/** Hands a link to the phone. Nothing that can open it (no mail app, no dialer) is not an error worth crashing for. */
export async function openLink(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    // The phone has nothing to open it with.
  }
}
