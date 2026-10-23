import { MapPreviewScreen } from '@taxikosmos/app-shell';
import { Redirect } from 'expo-router';

import { appConfig } from '../config';

/** The map, location permission and address search together. A development tool until booking exists: a production build sends anyone who reaches it back home. */
export default function MapPreview() {
  if (appConfig.environment === 'production') {
    return <Redirect href="/" />;
  }

  return <MapPreviewScreen tileUrl={appConfig.mapTileUrl ?? undefined} />;
}
