import Constants from 'expo-constants';
import { StyleSheet, Text, View } from 'react-native';

import { appConfig } from '../config';

/** Placeholder home until the navigation shell (M1-T4); proves the build boots with the right identity and environment. */
export default function Home() {
  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        {Constants.expoConfig?.name}
      </Text>
      <Text style={styles.detail}>Environment: {appConfig.environment}</Text>
      <Text style={styles.detail}>API: {appConfig.apiUrl}</Text>
    </View>
  );
}

// Colours from RiderTaxiAppTemplate/src/index.css until the design system (M1-T3) replaces them.
const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F5F6F2', padding: 24 },
  title: { fontSize: 24, fontWeight: '800', color: '#020617' },
  detail: { fontSize: 14, color: '#64748B' },
});
