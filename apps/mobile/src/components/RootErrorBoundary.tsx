/**
 * RootErrorBoundary — last-resort catch for render/lifecycle errors anywhere
 * in the tree. Registered ABOVE <App/> in index.js so it survives even if the
 * providers, theme, or a startup hook throw.
 *
 * WHY this exists: a fatal JS error during startup gets picked up by
 * expo-updates' error-recovery, which then tries to relaunch and hard-crashes
 * (RelaunchProcedure force-unwrap of a nil error) — so the ORIGINAL error is
 * never seen. Catching it here stops that chain: the app shows the real error
 * on-screen (and reports it to Sentry) instead of vanishing to the springboard.
 *
 * Deliberately self-contained: hardcoded colors and only RN primitives, so the
 * fallback renders even if the design tokens / theme are what failed. This is
 * the ONE place the "never hardcode a hex" rule is intentionally waived.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Sentry from '@sentry/react-native';

type Props = { children: ReactNode };
type State = { error: Error | null; componentStack: string | null };

export class RootErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? null });
    // No-op if Sentry was never init'd (unset DSN), so this is always safe.
    try {
      Sentry.captureException(error, {
        contexts: { react: { componentStack: info.componentStack } },
        tags: { boundary: 'root' },
      });
    } catch {
      // never let error reporting cause a second failure
    }
    // Surface it in the device log too (visible via Console / eas device logs).
    console.error('[RootErrorBoundary] caught fatal render error:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    return <StartupErrorView error={error} componentStack={componentStack} />;
  }
}

/** Shown for render errors AND for import-time failures caught in index.js. */
export function StartupErrorView({
  error,
  componentStack,
}: {
  error: unknown;
  componentStack?: string | null;
}) {
  const err = error instanceof Error ? error : new Error(String(error));
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>The app hit a snag</Text>
        <Text style={styles.subtitle}>
          The app caught a startup error. This screen is here so the details can be read and
          reported instead of the app closing.
        </Text>

        <Text style={styles.label}>Error</Text>
        <Text style={styles.mono} selectable>
          {err.name}: {err.message}
        </Text>

        {err.stack ? (
          <>
            <Text style={styles.label}>Stack</Text>
            <Text style={styles.monoSmall} selectable>
              {err.stack}
            </Text>
          </>
        ) : null}

        {componentStack ? (
          <>
            <Text style={styles.label}>Component stack</Text>
            <Text style={styles.monoSmall} selectable>
              {componentStack}
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F2E9' },
  content: { padding: 24, paddingTop: 72, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#23211B' },
  subtitle: { fontSize: 14, lineHeight: 20, color: '#5C574C' },
  label: { marginTop: 12, fontSize: 12, fontWeight: '700', color: '#9A7342', letterSpacing: 0.5 },
  mono: { fontFamily: 'Courier', fontSize: 14, color: '#23211B' },
  monoSmall: { fontFamily: 'Courier', fontSize: 11, lineHeight: 16, color: '#5C574C' },
});
