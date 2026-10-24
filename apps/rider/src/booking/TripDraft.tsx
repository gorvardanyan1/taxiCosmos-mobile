import type { AddressPoint, FareQuote, VehicleClass } from '@taxikosmos/core';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/** What the rider chose on the home screen and the estimate it was priced with: the starting point of the ride options (M4-T2). */
export interface TripDraft {
  pickup: AddressPoint;
  dropoff: AddressPoint;
  quote: FareQuote;
  /** The vehicle class the rider picked on the ride options; `null` until they open them (the first class is shown as chosen). */
  vehicleClass: VehicleClass | null;
}

interface TripDraftValue {
  draft: TripDraft | null;
  setDraft: (draft: TripDraft | null) => void;
  /** Changes some of the draft (the class, or a new quote after the old one expired); does nothing without a draft. */
  updateDraft: (changes: Partial<Pick<TripDraft, 'quote' | 'vehicleClass'>>) => void;
}

const TripDraftContext = createContext<TripDraftValue | null>(null);

export function TripDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<TripDraft | null>(null);
  const value = useMemo(
    () => ({
      draft,
      setDraft,
      updateDraft: (changes: Partial<Pick<TripDraft, 'quote' | 'vehicleClass'>>) =>
        setDraft((current) => (current === null ? null : { ...current, ...changes })),
    }),
    [draft],
  );

  return <TripDraftContext.Provider value={value}>{children}</TripDraftContext.Provider>;
}

export function useTripDraft(): TripDraftValue {
  const value = useContext(TripDraftContext);

  if (value === null) {
    throw new Error('useTripDraft must be used inside <TripDraftProvider>.');
  }

  return value;
}
