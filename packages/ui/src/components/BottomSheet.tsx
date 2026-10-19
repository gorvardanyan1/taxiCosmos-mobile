import type { ReactNode } from 'react';
import { Modal as NativeModal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUiTranslation } from '../i18n/hooks';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** A panel that slides up from the bottom. Tapping outside, the close button and the Android back button all call `onClose`. */
export function BottomSheet({ visible, onClose, title, children }: BottomSheetProps) {
  const { t } = useUiTranslation();
  const insets = useSafeAreaInsets();

  return (
    <NativeModal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          className="absolute inset-0 bg-slate-950/50"
        />
        <View
          accessibilityViewIsModal
          className="max-h-[85%] rounded-t-sheet bg-paper px-5 pt-3 dark:bg-slate-900"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <View className="mb-3 h-1 w-10 self-center rounded-full bg-slate-300 dark:bg-slate-700" />
          <View className="mb-4 flex-row items-center justify-between">
            <Text
              accessibilityRole="header"
              className="flex-1 text-xl font-manrope-extrabold text-slate-950 dark:text-white"
            >
              {title}
            </Text>
            <IconButton icon="close" label={t('common.close')} onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </NativeModal>
  );
}
