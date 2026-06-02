import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { SourceSerif4_400Regular, SourceSerif4_600SemiBold, SourceSerif4_700Bold } from '@expo-google-fonts/source-serif-4';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { tokens } from './src/theme/tokens';
import { PantryScreen } from './src/features/pantry/PantryScreen';
import { setupPowerSync } from './src/data/powersync/db';

export default function App() {
  const [fontsLoaded] = useFonts({
    SourceSerif4_400Regular,
    SourceSerif4_600SemiBold,
    SourceSerif4_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const [syncReady, setSyncReady] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);

  useEffect(() => {
    setupPowerSync()
      .then(() => setSyncReady(true))
      .catch((e: unknown) => {
        const err = e instanceof Error ? e : new Error(String(e));
        console.error('PowerSync setup failed:', err);
        setSyncError(err);
      });
  }, []);

  if (syncError) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>
          PowerSync failed to start.{'\n'}
          {syncError.message}
        </Text>
      </View>
    );
  }

  if (!fontsLoaded || !syncReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={tokens.color.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <PantryScreen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.surface,
  },
  errorText: {
    color: tokens.color.accent,
    padding: 24,
    textAlign: 'center',
  },
});
