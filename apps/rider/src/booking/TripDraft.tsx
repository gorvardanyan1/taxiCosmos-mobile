import type { AddressPoint, FareQuote } from '@taxikosmos/core';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/** What the rider chose on the home screen and the estimate it was priced with: the starting point of the ride options (M4-T2). */
export interface TripDraft {
  pickup: AddressPoint;
  dropoff: AddressPoint;
  quote: FareQuote;
}

interface TripDraftValue {
  draft: TripDraft | null;
  setDraft: (draft: TripDraft | null) => void;
}

const TripDraftContext = createContext<TripDraftValue | null>(null);

export function TripDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<TripDraft | null>(null);
  const value = useMemo(() => ({ draft, setDraft }), [draft]);

  return <TripDraftContext.Provider value={value}>{children}</TripDraftContext.Provider>;
}

export function useTripDraft(): TripDraftValue {
  const value = useContext(TripDraftContext);

  if (value === null) {
    throw new Error('useTripDraft must be used inside <TripDraftProvider>.');
  }

  return value;
}
