import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Bitter_400Regular, Bitter_600SemiBold, Bitter_700Bold } from '@expo-google-fonts/bitter';
import { NunitoSans_400Regular, NunitoSans_600SemiBold, NunitoSans_700Bold } from '@expo-google-fonts/nunito-sans';
import { StyleSheet, Text, View } from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  NavigationContainer,
  type LinkingOptions,
  type NavigatorScreenParams,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PowerSyncContext, type PowerSyncDatabase } from '@powersync/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { tokens } from './src/theme/tokens';
import { setupPowerSync } from './src/data/powersync/db';
import { navigationRef } from './src/navigation/navigationRef';
import { MainTabs, type TabParamList } from './src/navigation/MainTabs';
import { AddItemScreen } from './src/features/pantry/AddItemScreen';
import { ScanScreen } from './src/features/capture/ScanScreen';
import { BulkPasteScreen } from './src/features/capture/BulkPasteScreen';
import { QuickAddScreen } from './src/features/pantry/QuickAddScreen';
import { EditItemScreen } from './src/features/pantry/EditItemScreen';
import { ExpiringSoonScreen } from './src/features/pantry/ExpiringSoonScreen';
import { ReviewDatesScreen } from './src/features/pantry/ReviewDatesScreen';
import { InsightsScreen } from './src/features/insights/InsightsScreen';
import { CollectionsScreen } from './src/features/insights/CollectionsScreen';
import { CookbookScreen } from './src/features/insights/CookbookScreen';
import { RecipeDetailScreen } from './src/features/recipes/RecipeDetailScreen';
import { FavoritesScreen } from './src/features/recipes/FavoritesScreen';
import { HistoryScreen } from './src/features/activity/HistoryScreen';
import { DeleteAccountScreen } from './src/features/account/DeleteAccountScreen';
import { HouseholdScreen } from './src/features/household/HouseholdScreen';
import { InviteCodeModal } from './src/features/household/InviteCodeModal';
import { JoinHouseholdScreen } from './src/features/household/JoinHouseholdScreen';
import { INVITE_URL_SCHEME } from './src/features/household/inviteLink';
import { ActiveHouseholdProvider } from './src/features/household/ActiveHouseholdContext';
import { AuthProvider, useAuth } from './src/features/auth/AuthContext';
import { SignInScreen } from './src/features/auth/SignInScreen';
import { SignUpScreen } from './src/features/auth/SignUpScreen';
import { ForgotPasswordScreen } from './src/features/auth/ForgotPasswordScreen';
import { OnboardingScreen } from './src/features/onboarding/OnboardingScreen';
import { useOnboarding } from './src/features/onboarding/useOnboarding';
import { BrandLoadingScreen } from './src/components/BrandLoading';
import { WelcomeBeat } from './src/components/WelcomeBeat';
import { FirstRunReveal } from './src/motion/FirstRunReveal';
import { useExpiringWidget } from './src/features/widget/useExpiringWidget';
import { useShoppingWidget } from './src/features/widget/useShoppingWidget';
import { FavoriteStoresScreen } from './src/features/settings/FavoriteStoresScreen';
import { TipsScreen } from './src/features/tips/TipsScreen';
import { DesignElementsScreen } from './src/features/dev/DesignElementsScreen';
import { registerPushToken } from './src/features/announcements/registerPushToken';
import { attachAnnouncementResponder } from './src/features/announcements/pushResponder';
import { PostHogAppProvider, screenPostHog } from './src/observability/posthog';
import type { SpoonacularRecipe } from './src/data/spoonacular/types';

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList> | undefined;
  AddItem: undefined;
  Scan: undefined;
  BulkPaste: undefined;
  QuickAdd: undefined;
  EditItem: { itemId: string };
  ExpiringSoon: undefined;
  ReviewDates: undefined;
  Insights: undefined;
  Collections: undefined;
  Cookbook: undefined;
  RecipeDetail: { recipe: SpoonacularRecipe };
  Favorites: undefined;
  History: undefined;
  DeleteAccount: undefined;
  Household: undefined;
  InviteCodeModal: { householdId: string };
  JoinHousehold: { code?: string } | undefined;
  FavoriteStores: undefined;
  Tips: undefined;
  DesignElements: undefined;
};

export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStackNav = createNativeStackNavigator<AuthStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [`${INVITE_URL_SCHEME}://`],
  config: {
    screens: {
      JoinHousehold: 'invite/:code',
      // Widget tap targets (see features/widget/widgetLinks.ts).
      ExpiringSoon: 'expiring',
      MainTabs: {
        screens: {
          PantryTab: 'pantry',
          CookTab: 'cook',
          ShoppingTab: 'shopping',
          SettingsTab: 'settings',
        },
      },
    },
  },
};

function AppStack() {
  // Keep the home/lock-screen widgets in sync with the live pantry and
  // shopping list while the user is in the authenticated tree (iOS-only,
  // best-effort — see useExpiringWidget / useShoppingWidget).
  useExpiringWidget();
  useShoppingWidget();

  return (
    <Stack.Navigator
      initialRouteName="MainTabs"
      screenOptions={{
        headerStyle: { backgroundColor: tokens.color.surface },
        headerTintColor: tokens.color.accent,
        headerTitleStyle: {
          fontFamily: tokens.font.display.bold,
          color: tokens.color.ink,
        },
      }}
    >
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="AddItem" component={AddItemScreen} options={{ title: 'Add item' }} />
      <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan' }} />
      <Stack.Screen name="BulkPaste" component={BulkPasteScreen} options={{ title: 'Paste a list' }} />
      <Stack.Screen name="QuickAdd" component={QuickAddScreen} options={{ title: 'Quick add' }} />
      <Stack.Screen name="EditItem" component={EditItemScreen} options={{ title: 'Edit item' }} />
      <Stack.Screen name="ExpiringSoon" component={ExpiringSoonScreen} options={{ title: 'Use soon' }} />
      <Stack.Screen name="ReviewDates" component={ReviewDatesScreen} options={{ title: 'Review dates' }} />
      <Stack.Screen name="Insights" component={InsightsScreen} options={{ title: 'Your impact' }} />
      <Stack.Screen name="Collections" component={CollectionsScreen} options={{ title: 'Your collection' }} />
      <Stack.Screen name="Cookbook" component={CookbookScreen} options={{ title: 'Your cookbook' }} />
      <Stack.Screen name="RecipeDetail" component={RecipeDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} options={{ title: 'Your Kitchen' }} />
      <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'History' }} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ title: 'Delete account' }} />
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
      <Stack.Screen
        name="FavoriteStores"
        component={FavoriteStoresScreen}
        options={{ title: 'Your stores' }}
      />
      <Stack.Screen
        name="Tips"
        component={TipsScreen}
        options={{ title: 'Kitchen tips' }}
      />
      {/* Reachable in TestFlight (production channel) so testers can preview the
          App Elements kit. Re-gate behind __DEV__ before any PUBLIC App Store
          release — see Settings → Developer. */}
      <Stack.Screen
        name="DesignElements"
        component={DesignElementsScreen}
        options={{ title: 'Design elements' }}
      />
    </Stack.Navigator>
  );
}

function AuthStack() {
  return (
    <AuthStackNav.Navigator initialRouteName="SignIn" screenOptions={{ headerShown: false }}>
      <AuthStackNav.Screen name="SignIn" component={SignInScreen} />
      <AuthStackNav.Screen name="SignUp" component={SignUpScreen} />
      <AuthStackNav.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStackNav.Navigator>
  );
}

function AppRoot() {
  const { state } = useAuth();
  const userId = state.status === 'authenticated' ? state.session.user.id : null;
  const { needsOnboarding, loading: onboardingLoading, complete } = useOnboarding(userId);

  // Soft terracotta welcome beat once per sign-on (resets on sign-out).
  const [welcomeDone, setWelcomeDone] = useState(false);
  // First-run glyph stagger plays once before the welcome splash.
  const [firstRevealDone, setFirstRevealDone] = useState(false);

  useEffect(() => {
    if (!userId) {
      setWelcomeDone(false);
      setFirstRevealDone(false);
      return;
    }
    void registerPushToken(userId);
    const sub = attachAnnouncementResponder();
    return () => sub.remove();
  }, [userId]);

  if (state.status === 'loading') {
    return <BrandLoadingScreen message="Loading your pantry…" />;
  }

  if (state.status !== 'authenticated') {
    return <AuthStack />;
  }

  if (onboardingLoading) {
    return <BrandLoadingScreen message="Loading your pantry…" />;
  }

  if (needsOnboarding && !firstRevealDone) {
    return <FirstRunReveal onDone={() => setFirstRevealDone(true)} />;
  }

  if (!welcomeDone) {
    return <WelcomeBeat onDone={() => setWelcomeDone(true)} />;
  }

  if (needsOnboarding) {
    return (
      <OnboardingScreen
        onDone={() => {
          // Land on Pantry (the home tab) so seeded staples are visible.
          // Cook-tab landing hid the items and looked like a failed setup.
          void complete();
        }}
      />
    );
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
  const routeNameRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    setupPowerSync()
      .then((instance) => setDb(instance))
      .catch((e: unknown) => {
        const err = e instanceof Error ? e : new Error(String(e));
        console.error('PowerSync setup failed:', err);
        setSyncError(err);
      });
  }, []);

  const trackScreen = useCallback(() => {
    const current = navigationRef.getCurrentRoute()?.name;
    if (current && current !== routeNameRef.current) {
      screenPostHog(current);
      routeNameRef.current = current;
    }
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
    return <BrandLoadingScreen message="Loading your pantry…" />;
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
    <SafeAreaProvider>
      <StatusBar style={tokens.colorScheme === 'dark' ? 'light' : 'dark'} />
      <PowerSyncContext.Provider value={db}>
        <AuthProvider>
          <ActiveHouseholdProvider>
            <NavigationContainer
              ref={navigationRef}
              linking={linking}
              onReady={trackScreen}
              onStateChange={trackScreen}
            >
              <PostHogAppProvider>
                <AppRoot />
              </PostHogAppProvider>
            </NavigationContainer>
          </ActiveHouseholdProvider>
        </AuthProvider>
      </PowerSyncContext.Provider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.surface,
    paddingHorizontal: 24,
  },
});
