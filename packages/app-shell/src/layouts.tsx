import { useSessionStatus } from '@taxikosmos/api-client';
import { safeNextPath } from '@taxikosmos/core';
import { Redirect, Stack, useGlobalSearchParams, usePathname, type Href } from 'expo-router';
import { useState } from 'react';

const SIGN_IN = '/sign-in';

/**
 * The layout of the `(app)` group: every screen of the signed-in app. Nobody signed out gets past it: they are sent to sign-in and the
 * screen they were heading to travels along (`?next=`), so a link opened from a notification or the home screen is still there afterwards.
 */
export function AppGroupLayout() {
  const status = useSessionStatus();
  const pathname = usePathname();
  // Where the person was heading. It follows the screen while someone is signed in and then stands still: once the redirect starts the router
  // reports the start screen for a moment, and that must not replace the link the person actually opened.
  const [target, setTarget] = useState(pathname);

  if (status !== 'signed_out' && target !== pathname) {
    setTarget(pathname);
  }

  if (status === 'signed_out') {
    return <Redirect href={{ pathname: SIGN_IN, params: { next: target } } as unknown as Href} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

/**
 * The layout of the `(auth)` group: the sign-in screens. Once someone is signed in they are taken on to the screen they were heading to,
 * or the start. `next` comes from a link anyone can craft, so only a path inside this app is followed (`safeNextPath`).
 */
export function AuthGroupLayout() {
  const status = useSessionStatus();
  // Global, not local: `next` is a parameter of the sign-in screen below this layout, and a layout only sees its own.
  const { next } = useGlobalSearchParams<{ next?: string }>();
  // Where to go once signed in. It follows the link while the person is signed out and then stands still: the redirect itself changes the
  // screen below, and the layout would otherwise read the parameter as gone and send the person to the start instead.
  const [target, setTarget] = useState(next);

  if (status !== 'signed_in' && target !== next) {
    setTarget(next);
  }

  if (status === 'signed_in') {
    return <Redirect href={(safeNextPath(target) ?? '/') as Href} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
