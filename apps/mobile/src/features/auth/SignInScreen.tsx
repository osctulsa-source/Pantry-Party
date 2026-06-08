/**
 * SignInScreen — migrated onto the UI primitives (Screen/Heading/Body/Input/Button).
 *
 * Success path: AuthContext state flips to 'authenticated' → App.tsx renders AppStack.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { tokens } from '../../theme/tokens';
import { Body, Button, Heading, Input, Screen } from '../../components/ui';
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
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.center}>
          <Heading size="xl">Welcome back</Heading>
          <Body tone="muted" style={styles.subtitle}>
            Sign in to your {tokens.brandName} account
          </Body>

          <Input
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <Input
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            style={styles.inputGap}
          />

          {error && (
            <Body tone="accent" weight="medium" size={13} style={styles.error}>
              {error}
            </Body>
          )}

          <Button title="Sign in" onPress={onSubmit} loading={submitting} style={styles.submit} />

          <Pressable style={styles.footerLink} onPress={() => navigation.navigate('SignUp')}>
            <Body tone="accent" weight="medium" size={14}>
              Need an account? Create one
            </Body>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: tokens.space(6) },
  subtitle: { marginTop: tokens.space(2), marginBottom: tokens.space(6) },
  inputGap: { marginTop: tokens.space(3) },
  error: { marginTop: tokens.space(3) },
  submit: { marginTop: tokens.space(4) },
  footerLink: { marginTop: tokens.space(5), alignItems: 'center' },
});
