import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { SourceSerif4_400Regular, SourceSerif4_600SemiBold, SourceSerif4_700Bold } from '@expo-google-fonts/source-serif-4';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PowerSyncContext, type PowerSyncDatabase } from '@powersync/react-native';

import { tokens } from './src/theme/tokens';
import { setupPowerSync } from './src/data/powersync/db';
import { PantryScreen } from './src/features/pantry/PantryScreen';
import { AddItemScreen } from './src/features/pantry/AddItemScreen';
import { RecipesScreen } from './src/features/recipes/RecipesScreen';
import { SettingsScreen } from './src/features/settings/SettingsScreen';
import { HouseholdScreen } from './src/features/household/HouseholdScreen';
import { InviteCodeModal } from './src/features/household/InviteCodeModal';
import { AuthProvider, useAuth } from './src/features/auth/AuthContext';
import { SignInScreen } from './src/features/auth/SignInScreen';
import { SignUpScreen } from './src/features/auth/SignUpScreen';
import { BRAND } from './src/theme/brand';

export type RootStackParamList = {
  Pantry: undefined;
  AddItem: undefined;
  Recipes: undefined;
  Settings: undefined;
  Household: undefined;
  InviteCodeModal: { householdId: string };
};

export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStackNav = createNativeStackNavigator<AuthStackParamList>();

function AppStack() {
  return (
    <Stack.Navigator
      initialRouteName="Pantry"
      screenOptions={{
        headerStyle: { backgroundColor: tokens.color.surface },
        headerTintColor: tokens.color.accent,
        headerTitleStyle: {
          fontFamily: tokens.font.display.bold,
          color: tokens.color.ink,
        },
      }}
    >
      <Stack.Screen name="Pantry" component={PantryScreen} options={{ title: BRAND.productName }} />
      <Stack.Screen name="AddItem" component={AddItemScreen} options={{ title: 'Add item' }} />
      <Stack.Screen name="Recipes" component={RecipesScreen} options={{ title: 'What you can cook' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen name="Household" component={HouseholdScreen} options={{ title: 'Household' }} />
      <Stack.Screen
        name="InviteCodeModal"
        component={InviteCodeModal}
        options={{ title: 'Invite member', presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}

function AuthStack() {
  return (
    <AuthStackNav.Navigator initialRouteName="SignIn" screenOptions={{ headerShown: false }}>
      <AuthStackNav.Screen name="SignIn" component={SignInScreen} />
      <AuthStackNav.Screen name="SignUp" component={SignUpScreen} />
    </AuthStackNav.Navigator>
  );
}

function AppRoot() {
  const { state } = useAuth();

  if (state.status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={tokens.color.accent} />
      </View>
    );
  }

  return state.status === 'authenticated' ? <AppStack /> : <AuthStack />;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    SourceSerif4_400Regular,
    SourceSerif4_600SemiBold,
    SourceSerif4_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const [db, setDb] = useState<PowerSyncDatabase | null>(null);
  const [syncError, setSyncError] = useState<Error | null>(null);

  useEffect(() => {
    setupPowerSync()
      .then((instance) => setDb(instance))
      .catch((e: unknown) => {
        const err = e instanceof Error ? e : new Error(String(e));
        console.error('PowerSync setup failed:', err);
        setSyncError(err);
      });
  }, []);

  if (syncError) {
    return (
      <View style={styles.loading}>
        <Text style={{ color: tokens.color.accent, padding: 24, textAlign: 'center' }}>
          PowerSync failed to start.{'\n'}{syncError.message}
        </Text>
      </View>
    );
  }

  if (!fontsLoaded || !db) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={tokens.color.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {/* PowerSyncContext makes the db instance available to useQuery() hooks
          inside any screen — see PantryScreen for the first consumer. */}
      <PowerSyncContext.Provider value={db}>
        <AuthProvider>
          <NavigationContainer>
            <AppRoot />
          </NavigationContainer>
        </AuthProvider>
      </PowerSyncContext.Provider>
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
});
