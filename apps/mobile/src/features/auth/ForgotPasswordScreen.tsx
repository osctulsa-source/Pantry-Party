/**
 * ForgotPasswordScreen — password recovery via emailed OTP code.
 *
 * Two steps on one screen:
 *   'request' — enter email, we send a 6-digit recovery code.
 *   'confirm' — enter the code + a new password.
 * On a successful confirm Supabase establishes a session, so AuthContext flips
 * to 'authenticated' → App.tsx renders AppStack (same success path as sign-in).
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { tokens } from '../../theme/tokens';
import { Body, Button, Heading, Input, Screen } from '../../components/ui';
import { BrandMark } from '../../components/BrandMark';
import { useAuth } from './AuthContext';
import type { AuthStackParamList } from '../../../App';

type Step = 'request' | 'confirm';

export function ForgotPasswordScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>>();
  const { requestPasswordReset, confirmPasswordReset } = useAuth();
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onRequest() {
    setError(null);
    setSubmitting(true);
    const { error: err } = await requestPasswordReset(email.trim());
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    setStep('confirm');
  }

  async function onConfirm() {
    setError(null);
    setSubmitting(true);
    const { error: err } = await confirmPasswordReset(email.trim(), code.trim(), password);
    setSubmitting(false);
    if (err) setError(err);
    // Success path: AuthContext flips to 'authenticated' → AppStack renders.
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.center}>
          <View style={styles.brand}>
            <BrandMark size={76} label="Breadbox" />
          </View>

          {step === 'request' ? (
            <>
              <Heading size="xl">Reset your password</Heading>
              <Body tone="muted" style={styles.subtitle}>
                Enter your email and we&apos;ll send you a code to reset your password.
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

              {error && (
                <Body tone="accent" weight="medium" size={13} style={styles.error}>
                  {error}
                </Body>
              )}

              <Button
                title="Send reset code"
                onPress={onRequest}
                loading={submitting}
                style={styles.submit}
              />
            </>
          ) : (
            <>
              <Heading size="xl">Enter your code</Heading>
              <Body tone="muted" style={styles.subtitle}>
                We sent a 6-digit code to {email.trim()}. Enter it below with your new password.
              </Body>

              <Input
                placeholder="6-digit code"
                value={code}
                onChangeText={setCode}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
              />
              <Input
                placeholder="New password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="newPassword"
                style={styles.inputGap}
              />

              {error && (
                <Body tone="accent" weight="medium" size={13} style={styles.error}>
                  {error}
                </Body>
              )}

              <Button
                title="Set new password"
                onPress={onConfirm}
                loading={submitting}
                style={styles.submit}
              />
            </>
          )}

          <Pressable style={styles.footerLink} onPress={() => navigation.navigate('SignIn')}>
            <Body tone="accent" weight="medium" size={14}>
              Back to sign in
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
  brand: { alignItems: 'center', marginBottom: tokens.space(6) },
  subtitle: { marginTop: tokens.space(2), marginBottom: tokens.space(6) },
  inputGap: { marginTop: tokens.space(3) },
  error: { marginTop: tokens.space(3) },
  submit: { marginTop: tokens.space(4) },
  footerLink: { marginTop: tokens.space(5), alignItems: 'center' },
});
