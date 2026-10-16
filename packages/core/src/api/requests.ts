import type {
  AppClient,
  DevicePlatform,
  DriverDocumentType,
  IsoDate,
  LatLng,
  Locale,
  SavedPlaceLabel,
  SupportCategory,
  VehicleClass,
} from './types.ts';

/** Request bodies and queries of `/api/v1`, matching the backend's Form Requests. */

export interface OtpRequestBody {
  /** E.164, e.g. `+37491234567` (normalise with `normalizePhone`). */
  phone: string;
  app: AppClient;
}

export interface OtpVerifyBody {
  phone: string;
  /** Six digits. */
  code: string;
  app: AppClient;
  /** A stable id for this install, 8–100 characters. */
  device_id: string;
  locale?: Locale | null;
}

export interface SocialLoginBody {
  /** The provider's token from the native sign-in SDK. */
  token: string;
  app: AppClient;
  device_id: string;
  locale?: Locale | null;
}

export type SocialProvider = 'google' | 'apple' | 'facebook';

export interface PhoneVerifyBody {
  phone: string;
  code: string;
}

export interface UpdateMeBody {
  name?: string;
  email?: string | null;
  locale?: Locale;
}

export interface PhoneChangeBody {
  phone: string;
}

export interface SavedPlaceBody extends LatLng {
  label: SavedPlaceLabel;
  name: string;
  address: string;
}

export type SavedPlaceUpdate = Partial<SavedPlaceBody>;

export interface FareEstimateBody {
  pickup: LatLng;
  dropoff: LatLng;
}

export interface GeoAutocompleteQuery extends Partial<LatLng> {
  q: string;
  /** One token per search session (letters, digits, `_`, `-`, up to 64): the maps provider bills a whole session as one. */
  session?: string;
}

export interface GeoRouteQuery {
  /** `lat,lng` */
  from: string;
  /** `lat,lng` */
  to: string;
}

export interface SupportTicketBody {
  category: SupportCategory;
  subject: string;
  message: string;
  trip_id?: number | null;
}

export interface SupportMessageBody {
  body: string;
}

export interface RegisterDeviceBody {
  /** `ExponentPushToken[…]` */
  push_token: string;
  platform: DevicePlatform;
  locale?: Locale | null;
  app_version?: string | null;
}

export interface DriverProfileBody {
  license_number: string;
  license_expiry: IsoDate;
  home_zone_id?: number | null;
}

export interface DriverVehicleBody {
  make: string;
  model: string;
  year: number;
  color: string;
  plate_number: string;
  vehicle_class: VehicleClass;
}

export type DriverVehicleUpdate = Partial<DriverVehicleBody>;

export interface DriverBankAccountBody {
  account_holder: string;
  bank_name: string;
  /** 8–34 letters and digits. */
  account_number: string;
  swift?: string | null;
}

export interface DriverAvailabilityBody {
  availability: 'online' | 'offline';
}

export interface DriverLocationBody extends LatLng {
  /** Degrees clockwise from north, 0–360. */
  heading?: number | null;
  /** Metres per second, 0–100. */
  speed?: number | null;
  /** GPS accuracy radius in metres. */
  accuracy?: number | null;
}

/** One document file picked on the device (the shape React Native's FormData accepts). */
export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}

export interface DriverDocumentUpload {
  type: DriverDocumentType;
  file: UploadFile;
  vehicle_id?: number | null;
  expires_at?: IsoDate | null;
  document_number?: string | null;
}
