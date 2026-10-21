import { ActivityIndicator, View } from 'react-native';

import { useUiTranslation } from '../i18n/hooks';
import { useTheme } from '../theme/ThemeProvider';

/** The whole screen while something the app needs first is on its way (the saved session, the start-up config, the account). */
export function LoadingScreen() {
  const { t } = useUiTranslation();
  const { colors } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      className="flex-1 items-center justify-center bg-paper dark:bg-slate-950"
    >
      <ActivityIndicator size="large" color={colors.icon} />
    </View>
  );
}
