import { useUpdateMe } from '@taxikosmos/api-client';
import { getApiError, fieldError, validName } from '@taxikosmos/core';
import { Button, Text, TextField, useUiTranslation } from '@taxikosmos/ui';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** The one question a new rider is asked after the first sign-in. Saving the name updates the account, which lets the gate open the app. */
export function NameScreen() {
  const { t } = useUiTranslation();
  const insets = useSafeAreaInsets();
  const update = useUpdateMe();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);

  // The keyboard's "done" key reaches `save` without the button's own lock; a ref (not state) also holds for two presses in the same instant.
  const saving = useRef(false);

  const save = async () => {
    const valid = validName(name);

    if (saving.current) {
      return;
    }

    if (valid === null) {
      setProblem(name.trim() === '' ? t('name.required') : t('name.tooLong'));
      return;
    }

    saving.current = true;
    setProblem(null);
    setSaveFailure(null);

    try {
      await update.mutateAsync({ name: valid });
    } catch (error) {
      const api = getApiError(error);
      const field = fieldError(error, 'name');

      if (field !== null) {
        setProblem(field);
      } else {
        setSaveFailure(api?.kind === 'network' || api?.kind === 'timeout' ? t('name.offline') : t('name.failed'));
      }
    } finally {
      saving.current = false;
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-paper dark:bg-slate-950"
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
      >
        <View className="gap-6">
          <View className="gap-2">
            <Text
              accessibilityRole="header"
              className="text-screen-title font-manrope-extrabold text-slate-950 dark:text-white"
            >
              {t('name.title')}
            </Text>
            <Text className="text-sm leading-5 text-slate-500 dark:text-slate-400">{t('name.subtitle')}</Text>
          </View>
          <TextField
            label={t('name.label')}
            placeholder={t('name.placeholder')}
            value={name}
            onChangeText={(text) => {
              setName(text);
              setProblem(null);
            }}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            autoFocus
            {...(problem !== null ? { error: problem } : {})}
          />
          {saveFailure !== null ? (
            <Text accessibilityRole="alert" className="text-sm font-manrope-semibold text-red-600 dark:text-red-500">
              {saveFailure}
            </Text>
          ) : null}
          <Button fullWidth variant="primary" label={t('name.save')} onPress={save} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
