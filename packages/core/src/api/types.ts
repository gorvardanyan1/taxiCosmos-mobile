/**
 * The JSON the Laravel backend returns on `/api/v1`, written against real responses (`scripts/capture-fixtures.mjs` records them into
 * `src/fixtures`, and the compiler checks every recorded response against these types).
 *
 * Conventions of the API: money is `{ amount, currency }` with `amount` an integer in minor units; instants are ISO 8601 strings
 * with an offset; calendar dates are `YYYY-MM-DD`; coordinates are `lat` / `lng` decimal degrees. Messages are in the language of
 * the `Accept-Language` header.
 */

import type { ApiErrorBody } from './errors.ts';
import type { SocialProvider } from './requests.ts';

/** An ISO 8601 instant such as `2026-10-16T07:31:28+00:00`. */
export type IsoInstant = string;
/** A calendar date, `YYYY-MM-DD`. */
export type IsoDate = string;

export type AppClient = 'rider' | 'driver';
export type Locale = 'en' | 'ru' | 'hy';

export interface Money {
  /** Integer in minor units (1 AMD = 1, 1 USD = 100). */
  amount: number;
  /** ISO 4217 code. */
  currency: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

// ---- envelopes ----

/** Most resources answer `{ data: … }`. */
export interface Data<T> {
  data: T;
}

export interface PageMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

// ---- auth ----

export interface OtpRequested {
  message: string;
  /** Seconds the code stays valid. */
  expires_in: number;
}

export interface AuthSession {
  access_token: string;
  access_token_expires_at: IsoInstant;
  /** Single use: sending an already used refresh token ends the whole session on the server. */
  refresh_token: string;
  user: Me;
  /** A social sign-in without a phone number: the session may only add the phone (`POST /auth/phone/verify`). */
  needs_phone: boolean;
}

// ---- the signed-in person ----

export type UserStatus = 'active' | 'suspended' | 'deactivated' | 'pending_deletion';
export type DriverVerificationStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type DriverAvailability = 'offline' | 'online' | 'on_trip';
export type VehicleClass = 'economy' | 'comfort' | 'business';
export type VehicleStatus = 'active' | 'inactive' | 'pending_review';
export type DriverDocumentType = 'license' | 'id_card' | 'vehicle_registration' | 'insurance' | 'background_check';
export type DriverDocumentStatus = 'pending' | 'approved' | 'rejected' | 'expired';
/** Where one required document stands: `missing` until the first upload. */
export type DocumentRequirementState = 'missing' | 'pending' | 'rejected' | 'expired';

export interface RequiredDocument {
  type: DriverDocumentType;
  status: DocumentRequirementState;
  /** The reviewer's reason when the document was rejected. */
  reason: string | null;
}

export interface DriverVehicle {
  id: number;
  make: string;
  model: string;
  year: number;
  plate_number: string;
  color: string;
  vehicle_class: VehicleClass;
  status: VehicleStatus;
  is_primary: boolean;
}

export interface DriverBlock {
  verification_status: DriverVerificationStatus;
  availability: DriverAvailability;
  documents: RequiredDocument[];
  primary_vehicle: Omit<DriverVehicle, 'is_primary'> | null;
  /** The driver owes the platform more than the debt limit and may not go online. */
  debt_limit_reached: boolean;
}

export interface RiderBlock {
  rating: { average: number | null; count: number };
  outstanding_balance: Money;
  /** Always `null` until card payments exist (P6); widened by M4-T7. */
  default_payment_method: null;
}

export interface Me {
  id: number;
  name: string | null;
  /** Masked by the server (`+374*****058`): never the full number. */
  phone: string | null;
  email: string | null;
  email_verified: boolean;
  /** `null` until the person (or the app, at sign-in) picks a language: both are optional in the API. */
  locale: Locale | null;
  timezone: string | null;
  status: UserStatus;
  modes: { is_rider: boolean; is_driver: boolean };
  driver: DriverBlock | null;
  rider: RiderBlock | null;
}

export interface MeResponse {
  user: Me;
}

// ---- saved places ----

export type SavedPlaceLabel = 'home' | 'work' | 'other';

export interface SavedPlace extends LatLng {
  id: number;
  label: SavedPlaceLabel;
  name: string;
  address: string;
}

// ---- fares ----

export interface FareEstimate {
  vehicle_class: VehicleClass;
  currency: string;
  amount: number;
  amount_min: number;
  amount_max: number;
  /** A decimal string such as `"1.00"`, never a float. */
  surge_multiplier: string;
  eta_to_pickup_seconds: number | null;
}

export interface FareQuote {
  /** Send it with the trip request; it expires at `expires_at` (410 `quote_expired`). */
  quote_id: string;
  expires_at: IsoInstant;
  zone: { id: number; name: string };
  currency: string;
  distance_meters: number;
  duration_seconds: number;
  estimates: FareEstimate[];
}

// ---- trips ----

/** `matched`: a driver accepted and is on the way. `no_driver_found`, `completed` and `cancelled` are final. */
export type TripStatus =
  'requested' | 'matched' | 'arrived' | 'in_progress' | 'completed' | 'cancelled' | 'no_driver_found';
export type TripPaymentMethod = 'cash' | 'card' | 'wallet';
export type TripCancelledBy = 'rider' | 'driver' | 'admin' | 'system';

export interface TripPlace extends LatLng {
  address: string;
}

/** A trip as the rider app sees it (the driver's phone never appears; `driver` and `vehicle` are `null` until someone has the trip). */
export interface Trip {
  id: number;
  code: string;
  status: TripStatus;
  vehicle_class: VehicleClass;
  pickup: TripPlace;
  dropoff: TripPlace;
  fare: { currency: string; estimated: number; final: number | null };
  payment: { method: TripPaymentMethod; status: string };
  driver: { name: string; rating_avg: number | null; rating_count: number } | null;
  vehicle: {
    make: string;
    model: string;
    color: string;
    plate_number: string;
    vehicle_class: VehicleClass;
  } | null;
  eta_to_pickup_seconds: number | null;
  /** Worked out when the trip is completed; `null` before. */
  distance_meters: number | null;
  duration_seconds: number | null;
  cancelled_by: TripCancelledBy | null;
  cancel_reason: string | null;
  requested_at: IsoInstant;
  matched_at: IsoInstant | null;
  arrived_at: IsoInstant | null;
  started_at: IsoInstant | null;
  completed_at: IsoInstant | null;
  cancelled_at: IsoInstant | null;
}

/** 409 `active_trip_exists` of `POST /trips`: the rider already has this trip. */
export interface TripRequestRefusal extends ApiErrorBody {
  trip?: Trip;
}

/** 409 `trip_state_conflict`: the step does not fit the trip as it is now; `trip` is the trip as it is. */
export interface TripConflict extends ApiErrorBody {
  trip: Trip;
}

// ---- maps ----

export interface GeoSuggestion {
  place_id: string;
  text: string;
  primary_text: string;
  secondary_text: string | null;
}

export interface GeoPlace {
  /** `null` when the maps provider has no id for the spot (a reverse lookup of a bare coordinate). */
  place_id: string | null;
  name: string | null;
  address: string;
  location: LatLng;
}

export interface GeoRoute {
  distance_meters: number;
  duration_seconds: number;
  /** Google encoded polyline (precision 5). */
  polyline: string;
}

export interface GeoAutocompleteResponse {
  suggestions: GeoSuggestion[];
}

export interface GeoPlaceResponse {
  place: GeoPlace;
}

export interface GeoRouteResponse {
  route: GeoRoute;
}

// ---- support ----

export type SupportCategory =
  'fare' | 'lost_item' | 'safety' | 'driver_behavior' | 'rider_behavior' | 'app_issue' | 'other';
export type SupportStatus = 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed';
export type SupportPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface SupportMessage {
  id: number;
  from: 'you' | 'support';
  body: string;
  created_at: IsoInstant;
}

export interface SupportTicket {
  id: number;
  code: string;
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  status: SupportStatus;
  trip_id: number | null;
  resolution: string | null;
  resolved_at: IsoInstant | null;
  last_message_at: IsoInstant | null;
  created_at: IsoInstant;
  /** Only on the single-ticket answer. */
  messages?: SupportMessage[];
}

/** What adding a message answers: the message and where the ticket stands now. */
export interface SupportMessageReceipt extends SupportMessage {
  ticket_status: SupportStatus;
}

// ---- push devices ----

export type DevicePlatform = 'ios' | 'android';

export interface Device {
  id: number;
  app: AppClient;
  platform: DevicePlatform;
  locale: Locale | null;
  app_version: string | null;
  last_seen_at: IsoInstant;
}

export interface DeviceResponse {
  device: Device;
}

// ---- driver onboarding ----

export interface DriverApplication {
  verification_status: DriverVerificationStatus;
  license: { number_last4: string | null; expiry: IsoDate | null };
  home_zone_id: number | null;
}

export interface DriverBankAccount {
  id: number;
  account_holder: string;
  bank_name: string;
  /** The server never returns the full number. */
  account_last4: string;
  swift: string | null;
  is_default: boolean;
  verified: boolean;
  created_at: IsoInstant;
}

export interface DriverDocument {
  id: number;
  type: DriverDocumentType;
  vehicle_id: number | null;
  status: DriverDocumentStatus;
  rejection_reason: string | null;
  expires_at: IsoDate | null;
  uploaded_at: IsoInstant;
  reviewed_at: IsoInstant | null;
}

export interface DriverDocumentsResponse {
  data: DriverDocument[];
  required: RequiredDocument[];
  all_submitted: boolean;
}

export interface DriverAvailabilityResponse {
  availability: DriverAvailability;
}

export interface DriverLocationRecorded {
  /** `YYYY-MM-DDTHH:MM:SS.mmmZ`. */
  recorded_at: string;
}

// ---- app config (public, asked at every start before sign-in) ----

export type AppPlatform = 'ios' | 'android';

export interface AppConfigQuery {
  app: AppClient;
  platform: AppPlatform;
  /** This build's version (`1.4.2`). Left out, the server treats the build as unsupported. */
  version?: string | undefined;
}

export interface AppConfigUpdate {
  minimum_version: string | null;
  latest_version: string | null;
  /** This build may not run any more: show the update screen and stop. */
  force_update: boolean;
  /** A newer build exists (always true when the update is forced). */
  update_available: boolean;
  store_url: string | null;
}

export interface AppConfigFeatures {
  card_payments: boolean;
  wallet: boolean;
  masked_calls: boolean;
  sos: boolean;
  trip_share: boolean;
  social_login: Record<SocialProvider, boolean>;
}

export interface AppConfig {
  app: AppClient;
  platform: AppPlatform;
  update: AppConfigUpdate;
  features: AppConfigFeatures;
  support: { phone: string | null; email: string | null };
  /** One URL (or `null`) per language. */
  legal: { terms: Record<Locale, string | null>; privacy: Record<Locale, string | null> };
  vehicle_classes: { id: VehicleClass; name: string }[];
}
