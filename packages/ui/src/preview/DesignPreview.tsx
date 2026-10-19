import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CountryCode } from '@taxikosmos/core';

import { BottomSheet } from '../components/BottomSheet';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { DarkStatCard } from '../components/DarkStatCard';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { IconButton } from '../components/IconButton';
import { ListGroup } from '../components/ListGroup';
import { ListRow } from '../components/ListRow';
import { MenuRow } from '../components/MenuRow';
import { Modal } from '../components/Modal';
import { OtpInput } from '../components/OtpInput';
import { PhoneField } from '../components/PhoneField';
import { NotificationBell, ScreenHeader, ThemeToggleButton } from '../components/ScreenHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { Skeleton } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';
import { TabBar } from '../components/TabBar';
import { Text } from '../components/Text';
import { TextField } from '../components/TextField';
import { useToast } from '../components/Toast';
import { useFormat, useUiTranslation } from '../i18n/hooks';
import { useLocale } from '../i18n/LocaleProvider';
import { LOCALES, LOCALE_NAMES } from '../i18n/resources';
import { useTheme, type ThemePreference } from '../theme/ThemeProvider';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mb-8 px-5">
      <Text
        accessibilityRole="header"
        className="mb-3 pl-1 text-xs font-manrope-extrabold uppercase tracking-widest text-slate-400"
      >
        {title}
      </Text>
      <View className="gap-3">{children}</View>
    </View>
  );
}

/**
 * Every building block of the design system on one screen, in the theme and language the person picks at the top. It is how the kit is
 * checked by eye in light and dark, and it is the reference for what the real screens are made of.
 */
export function DesignPreview() {
  const { t } = useUiTranslation();
  const { preference, setPreference } = useTheme();
  const { locale, setLocale } = useLocale();
  const format = useFormat();
  const toast = useToast();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<CountryCode>('AM');
  const [code, setCode] = useState('');
  const [tab, setTab] = useState('home');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = () => {
    setSubmitting(true);

    return new Promise<void>((resolve) =>
      setTimeout(() => {
        setSubmitting(false);
        resolve();
      }, 1500),
    );
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-paper dark:bg-slate-950">
      <ScreenHeader
        title={t('preview.title')}
        subtitle={format.date(new Date(), 'weekdayDate')}
        actions={
          <>
            <ThemeToggleButton />
            <NotificationBell unread={3} />
          </>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Section title={t('preview.sectionTheme')}>
          <SegmentedControl<ThemePreference>
            label={t('theme.label')}
            value={preference}
            onChange={setPreference}
            options={[
              { value: 'system', label: t('theme.system') },
              { value: 'light', label: t('theme.light') },
              { value: 'dark', label: t('theme.dark') },
            ]}
          />
          <SegmentedControl
            label={t('language.label')}
            value={locale}
            onChange={setLocale}
            options={LOCALES.map((code) => ({ value: code, label: LOCALE_NAMES[code] }))}
          />
        </Section>

        <Section title={t('preview.sectionButtons')}>
          <Button label={t('preview.primary')} />
          <Button label={t('preview.accent')} variant="accent" icon="navigation" />
          <Button label={t('preview.ghost')} variant="ghost" />
          <Button label={t('preview.destructive')} variant="destructive" />
          <Button label={t('preview.submit')} loading={submitting} onPress={submit} variant="accent" />
          <Button label={t('preview.disabled')} disabled />
          <View className="flex-row items-center gap-3">
            <Button label={t('preview.primary')} size="sm" />
            <IconButton icon="settings" label={t('theme.label')} />
            <IconButton icon="bell" label={t('notifications.label')} dot />
          </View>
        </Section>

        <Section title={t('preview.sectionInputs')}>
          <TextField label={t('preview.nameLabel')} hint={t('preview.nameHint')} value={name} onChangeText={setName} />
          <TextField label={t('preview.nameLabel')} error={t('preview.nameError')} value="" />
          <PhoneField
            value={phone}
            country={country}
            onChange={(change) => {
              setPhone(change.text);
              setCountry(change.country);
            }}
          />
          <OtpInput value={code} onChange={setCode} />
        </Section>

        <Section title={t('preview.sectionCards')}>
          <DarkStatCard
            label={t('preview.todayEarnings')}
            value={format.money({ amount: 14850, currency: 'USD' })}
            aside={{ label: t('preview.goal'), value: '74%' }}
            progress={74}
            stats={[
              { icon: 'clock', value: '5h 24m', label: t('preview.online') },
              { icon: 'route', value: '12', label: t('preview.trips') },
              { icon: 'navigation', value: '86 km', label: t('preview.distance') },
            ]}
          />
          <Card>
            <Text className="text-xl font-manrope-extrabold text-slate-950 dark:text-white">Alex Morgan</Text>
            <Text className="mt-0.5 text-xs font-manrope-medium text-slate-400">
              {format.money({ amount: 150000, currency: 'AMD' })}
            </Text>
          </Card>
          <ListGroup>
            <MenuRow label={t('preview.personalInfo')} icon="user" onPress={() => undefined} />
            <MenuRow label={t('preview.safety')} icon="shield" onPress={() => undefined} />
            <MenuRow label={t('preview.help')} icon="help" value={LOCALE_NAMES[locale]} onPress={() => undefined} />
          </ListGroup>
          <ListGroup>
            <ListRow
              icon="route"
              title={t('preview.rideTitle')}
              subtitle={t('preview.rideSubtitle')}
              trailing={`+${format.money({ amount: 2480, currency: 'USD' })}`}
              trailingTone="positive"
            />
            <ListRow
              icon="car"
              title={t('preview.rideTitle')}
              subtitle={format.date(new Date(), 'dateTime')}
              trailing={format.money({ amount: 1500, currency: 'AMD' })}
            />
          </ListGroup>
          <View className="flex-row flex-wrap gap-2">
            <StatusBadge tone="success" label={t('preview.verified')} />
            <StatusBadge tone="warning" label={t('preview.pending')} />
            <StatusBadge tone="danger" label={t('preview.rejected')} />
            <StatusBadge tone="info" label={t('preview.info')} />
            <StatusBadge tone="neutral" label={t('preview.neutral')} />
            <StatusBadge tone="accent" label={t('preview.online')} />
          </View>
        </Section>

        <Section title={t('preview.sectionFeedback')}>
          <Skeleton className="h-24 rounded-card" label={t('common.loading')} />
          <Skeleton className="h-4 w-40" />
          <EmptyState title={t('preview.emptyTitle')} message={t('preview.emptyMessage')} />
          <ErrorState onRetry={() => undefined} />
          <ErrorState kind="offline" />
          <Button
            label={t('preview.showToast')}
            variant="ghost"
            onPress={() => toast.show({ message: t('preview.toastMessage'), tone: 'success' })}
          />
        </Section>

        <Section title={t('preview.sectionOverlays')}>
          <Button label={t('preview.openSheet')} variant="ghost" onPress={() => setSheetOpen(true)} />
          <Button label={t('preview.openModal')} variant="ghost" onPress={() => setModalOpen(true)} />
        </Section>
      </ScrollView>

      <TabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'home', label: t('preview.home'), icon: 'home' },
          { id: 'earnings', label: t('preview.earnings'), icon: 'wallet', badge: 2 },
          { id: 'profile', label: t('preview.profile'), icon: 'user' },
        ]}
      />

      <BottomSheet visible={sheetOpen} title={t('preview.sheetTitle')} onClose={() => setSheetOpen(false)}>
        <Text className="text-sm text-slate-500 dark:text-slate-400">{t('preview.sheetBody')}</Text>
      </BottomSheet>
      <Modal
        visible={modalOpen}
        title={t('preview.modalTitle')}
        message={t('preview.modalBody')}
        onClose={() => setModalOpen(false)}
        actions={
          <>
            <Button label={t('preview.destructive')} variant="destructive" onPress={() => setModalOpen(false)} />
            <Button label={t('preview.keep')} variant="ghost" onPress={() => setModalOpen(false)} />
          </>
        }
      />
    </SafeAreaView>
  );
}
