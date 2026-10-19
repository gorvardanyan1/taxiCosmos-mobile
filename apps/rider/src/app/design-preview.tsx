import { DesignPreview } from '@taxikosmos/ui';
import { Redirect } from 'expo-router';

import { appConfig } from '../config';

/** Every UI-kit block in both themes. A development tool: a production build sends anyone who reaches it back home. */
export default function DesignPreviewScreen() {
  if (appConfig.environment === 'production') {
    return <Redirect href="/" />;
  }

  return <DesignPreview />;
}
