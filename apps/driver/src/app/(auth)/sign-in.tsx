import { SignInScreen } from '@taxikosmos/app-shell';

import { appConfig } from '../../config';

export default function SignIn() {
  return <SignInScreen devLinks={appConfig.environment !== 'production'} />;
}
