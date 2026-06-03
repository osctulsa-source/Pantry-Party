import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { tokens } from '../../theme/tokens';
import { useAuth } from './AuthContext';
import type { AuthStackParamList } from '../../../App';

export function SignInScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList, 'SignIn'>>();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) setError(err);
    // Success path: AuthContext state flips to 'authenticated' → AppStack renders.
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.center}>
          <View style={styles.card}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to your {tokens.brandName} account</Text>

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={tokens.color.inkMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={tokens.color.inkMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
            />

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={[styles.submit, submitting && styles.submitDisabled]}
              onPress={onSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={tokens.color.surface} />
              ) : (
                <Text style={styles.submitText}>Sign in</Text>
              )}
            </Pressable>

            <Pressable style={styles.footerLink} onPress={() => navigation.navigate('SignUp')}>
              <Text style={styles.footerText}>Need an account? Create one</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface,
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: tokens.space(6),
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
  },
  title: {
    fontFamily: tokens.font.display.bold,
    fontSize: 32,
    color: tokens.color.ink,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: tokens.space(2),
    marginBottom: tokens.space(6),
    fontFamily: tokens.font.body.regular,
    fontSize: 15,
    color: tokens.color.inkMuted,
  },
  input: {
    marginBottom: tokens.space(3),
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    fontFamily: tokens.font.body.regular,
    fontSize: 16,
    color: tokens.color.ink,
  },
  error: {
    marginBottom: tokens.space(3),
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.color.accent,
  },
  submit: {
    marginTop: tokens.space(1),
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.success,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 16,
    color: tokens.color.surface,
  },
  footerLink: {
    marginTop: tokens.space(5),
    alignItems: 'center',
  },
  footerText: {
    fontFamily: tokens.font.body.medium,
    fontSize: 14,
    color: tokens.color.accent,
  },
});
