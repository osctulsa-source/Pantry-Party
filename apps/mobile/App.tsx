import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Bitter_400Regular, Bitter_600SemiBold, Bitter_700Bold } from '@expo-google-fonts/bitter';
import { NunitoSans_400Regular, NunitoSans_600SemiBold, NunitoSans_700Bold } from '@expo-google-fonts/nunito-sans';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useState, useEffect } from 'react';
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PowerSyncContext, type PowerSyncDatabase } from '@powersync/react-native';

import { tokens } from './src/theme/tokens';
import { setupPowerSync } from './src/data/powersync/db';
import { PantryScreen } from './src/features/pantry/PantryScreen';
import { AddItemScreen } from './src/features/pantry/AddItemScreen';
import { QuickAddScreen } from './src/features/pantry/QuickAddScreen';
import { EditItemScreen } from './src/features/pantry/EditItemScreen';
import { ExpiringSoonScreen } from './src/features/pantry/ExpiringSoonScreen';
import { RecipesScreen } from './src/features/recipes/RecipesScreen';
import { SettingsScreen } from './src/features/settings/SettingsScreen';
import { HouseholdScreen } from './src/features/household/HouseholdScreen';
import { InviteCodeModal } from './src/features/household/InviteCodeModal';
import { JoinHouseholdScreen } from './src/features/household/JoinHouseholdScreen';
import { INVITE_URL_SCHEME } from './src/features/household/inviteLink';
import { ActiveHouseholdProvider } from './src/features/household/ActiveHouseholdContext';
import { AuthProvider, useAuth } from './src/features/auth/AuthContext';
import { SignInScreen } from './src/features/auth/SignInScreen';
import { SignUpScreen } from './src/features/auth/SignUpScreen';
import { OnboardingScreen } from './src/features/onboarding/OnboardingScreen';
import { useOnboarding } from './src/features/onboarding/useOnboarding';
import { BRAND } from './src/theme/brand';

export type RootStackParamList = {
  Pantry: undefined;
  AddItem: undefined;
  QuickAdd: undefined;
  EditItem: { itemId: string };
  ExpiringSoon: undefined;
  Recipes: undefined;
  Settings: undefined;
  Household: undefined;
  InviteCodeModal: { householdId: string };
  JoinHousehold: { code?: string } | undefined;
};

export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStackNav = createNativeStackNavigator<AuthStackParamList>();

/**
 * Deep links: pantryparty://invite/BREAD-7K2M → JoinHousehold with the code
 * pre-filled (see JoinHouseholdScreen). The scheme is also declared in
 * app.json ("scheme") — both sides must match, and the app.json side is baked
 * into the native binary, so changing it needs a dev-client rebuild.
 *
 * V1 caveat: links resolve only while the AppStack is mounted (signed in +
 * onboarded). A signed-out user tapping a link lands on sign-in and the link
 * is dropped — buffering pending links through auth is a V2 refinement.
 */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [`${INVITE_URL_SCHEME}://`],
  config: {
    screens: {
      JoinHousehold: 'invite/:code',
    },
  },
};

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
      <Stack.Screen name="QuickAdd" component={QuickAddScreen} options={{ title: 'Quick add' }} />
      <Stack.Screen name="EditItem" component={EditItemScreen} options={{ title: 'Edit item' }} />
      <Stack.Screen name="ExpiringSoon" component={ExpiringSoonScreen} options={{ title: 'Use soon' }} />
      <Stack.Screen name="Recipes" component={RecipesScreen} options={{ title: 'What you can cook' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen name="Household" component={HouseholdScreen} options={{ title: 'Household' }} />
      <Stack.Screen
        name="InviteCodeModal"
        component={InviteCodeModal}
        options={{ title: 'Invite member', presentation: 'modal' }}
      />
      <Stack.Screen
        name="JoinHousehold"
        component={JoinHouseholdScreen}
        options={{ title: 'Join a household' }}
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
  const userId = state.status === 'authenticated' ? state.session.user.id : null;
  // Hook is called unconditionally (Rules of Hooks); it no-ops until userId is set.
  const { needsOnboarding, loading: onboardingLoading, complete } = useOnboarding(userId);

  if (state.status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={tokens.color.accent} />
      </View>
    );
  }

  if (state.status !== 'authenticated') {
    return <AuthStack />;
  }

  if (onboardingLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={tokens.color.accent} />
      </View>
    );
  }

  if (needsOnboarding) {
    return <OnboardingScreen onDone={complete} />;
  }

  return <AppStack />;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Bitter_400Regular,
    Bitter_600SemiBold,
    Bitter_700Bold,
    NunitoSans_400Regular,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
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
      <StatusBar style={tokens.colorScheme === 'dark' ? 'light' : 'dark'} />
      {/* PowerSyncContext makes the db instance available to useQuery() hooks
          inside any screen — see PantryScreen for the first consumer. */}
      <PowerSyncContext.Provider value={db}>
        <AuthProvider>
          {/* ActiveHouseholdProvider depends on BOTH AuthContext (for user_id)
              and PowerSync (for the user_households bootstrap query), so it
              must sit inside both. See features/household/ActiveHouseholdContext. */}
          <ActiveHouseholdProvider>
            <NavigationContainer linking={linking}>
              <AppRoot />
            </NavigationContainer>
          </ActiveHouseholdProvider>
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
