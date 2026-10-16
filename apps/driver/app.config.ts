import { buildExpoConfig } from '@taxikosmos/core/config';

// All environment rules live in @taxikosmos/core (packages/core/src/config); see docs/environments.md.
export default () => buildExpoConfig('driver', process.env);
