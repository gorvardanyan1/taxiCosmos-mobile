import type { AppConfig } from '@taxikosmos/core';
import { createContext, useContext } from 'react';

/** The start-up config the shell already fetched, for the screens below it (the legal links on sign-in). `undefined` while it is not known. */
export const ShellConfigContext = createContext<AppConfig | undefined>(undefined);

export function useShellConfig(): AppConfig | undefined {
  return useContext(ShellConfigContext);
}
