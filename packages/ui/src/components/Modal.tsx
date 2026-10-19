import type { ReactNode } from 'react';
import { Modal as NativeModal, Pressable, View } from 'react-native';

import { useUiTranslation } from '../i18n/hooks';
import { Text } from './Text';

export interface ModalProps {
  visible: boolean;
  /** Tapping outside the dialog and the Android back button call this. */
  onClose: () => void;
  title: string;
  message?: string;
  /** Extra content between the message and the buttons. */
  children?: ReactNode;
  /** The buttons, side by side or stacked: pass `Button`s. */
  actions?: ReactNode;
}

/** A centred confirmation dialog. */
export function Modal({ visible, onClose, title, message, children, actions }: ModalProps) {
  const { t } = useUiTranslation();

  return (
    <NativeModal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 items-center justify-center px-6">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          className="absolute inset-0 bg-slate-950/60"
        />
        <View accessibilityViewIsModal className="w-full max-w-[400px] rounded-card bg-white p-6 dark:bg-slate-900">
          <Text accessibilityRole="header" className="text-xl font-manrope-extrabold text-slate-950 dark:text-white">
            {title}
          </Text>
          {message ? (
            <Text className="mt-2 text-sm leading-5 text-slate-500 dark:text-slate-400">{message}</Text>
          ) : null}
          {children}
          {actions ? <View className="mt-5 gap-3">{actions}</View> : null}
        </View>
      </View>
    </NativeModal>
  );
}
