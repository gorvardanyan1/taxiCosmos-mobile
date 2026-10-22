import { SignInScreen } from '@taxikosmos/app-shell';

import { appApi } from '../../api';
import { appConfig } from '../../config';

export default function SignIn() {
  return (
    <SignInScreen
      app={appConfig.app}
      getDeviceId={appApi.getDeviceId}
      devLinks={appConfig.environment !== 'production'}
    />
  );
}
