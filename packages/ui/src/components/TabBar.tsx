import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUiTranslation } from '../i18n/hooks';
import { Icon, type IconName } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { cx } from './cx';
import { Text } from './Text';

export interface TabItem {
  id: string;
  label: string;
  icon: IconName;
  /** How many new things are waiting there; nothing is drawn for 0 or undefined, and "99+" above 99. */
  badge?: number;
}

export interface TabBarProps {
  tabs: readonly TabItem[];
  active: string;
  onChange: (id: string) => void;
}

/** The template's bottom bar: icon over label, the selected tab in ink with a small lime dot, optional count badge, safe-area aware. */
export function TabBar({ tabs, active, onChange }: TabBarProps) {
  const { t } = useUiTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('tabBar.label')}
      className="flex-row border-t border-slate-200/80 bg-white/95 px-5 pt-2 dark:border-slate-800 dark:bg-slate-900/95"
      style={{ paddingBottom: Math.max(12, insets.bottom) }}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        const badge = tab.badge && tab.badge > 0 ? tab.badge : 0;

        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityLabel={badge ? t('tabBar.badge', { label: tab.label, count: badge }) : tab.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.id)}
            className="min-h-[48px] flex-1 items-center gap-1 rounded-xl py-1.5 active:opacity-70"
          >
            <View>
              <Icon name={tab.icon} size={22} color={selected ? colors.icon : colors.iconMuted} />
              {selected ? <View className="absolute -right-2 -top-1 h-1.5 w-1.5 rounded-full bg-accent" /> : null}
              {badge ? (
                <View className="absolute -right-4 -top-2 h-4 min-w-[16px] items-center justify-center rounded-full bg-slate-950 px-1 dark:bg-accent">
                  <Text className="text-[9px] font-manrope-extrabold text-accent dark:text-slate-950">
                    {badge > 99 ? '99+' : String(badge)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              className={cx(
                'text-micro',
                selected
                  ? 'font-manrope-extrabold text-slate-950 dark:text-white'
                  : 'font-manrope-semibold text-slate-400',
              )}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
