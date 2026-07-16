/**
 * "Expiring Soon" widget — home-screen (small / medium) + lock-screen
 * (inline / circular / rectangular) families, written entirely in TypeScript
 * via expo-widgets (no Swift; replaces the old targets/widget WidgetKit code).
 *
 * The component body runs in the widget extension's isolated runtime, so it
 * can only use @expo/ui primitives and its own props/environment — every
 * constant and helper must live INSIDE the function (the bundler serializes
 * only the function body). Colors and brand name arrive through props from
 * the token layer (see widgetTheme.ts + useExpiringWidget.ts), never
 * hardcoded here.
 */
import { AccessoryWidgetBackground, HStack, Image, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { ExpiringWidgetItem } from './expiringSnapshot';
import type { WidgetThemePair } from './widgetTheme';

export interface ExpiringWidgetProps {
  count: number;
  soonestName: string | null;
  soonestLabel: string | null;
  items: ExpiringWidgetItem[];
  brandName: string;
  /** Deep link the widget opens on tap (built app-side; the scheme lives there). */
  url: string;
  theme: WidgetThemePair;
}

const ExpiringSoonWidgetView = (props: ExpiringWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const count = props.count ?? 0;
  const fresh = count === 0;
  const soonest =
    props.soonestName && props.soonestLabel
      ? `${props.soonestName} · ${props.soonestLabel}`
      : null;
  const family = environment.widgetFamily;

  // ── Lock-screen accessories: system-vibrant rendering, no custom colors ──

  if (family === 'accessoryInline') {
    return <Text>{fresh ? 'Pantry fresh' : (soonest ?? `${count} expiring`)}</Text>;
  }

  if (family === 'accessoryCircular') {
    return (
      <ZStack>
        <AccessoryWidgetBackground />
        {fresh ? (
          <Image systemName="checkmark" size={22} />
        ) : (
          <VStack spacing={0}>
            <Text modifiers={[font({ size: 22, weight: 'bold', design: 'rounded' })]}>
              {count}
            </Text>
            <Text modifiers={[font({ size: 9 })]}>{count === 1 ? 'item' : 'items'}</Text>
          </VStack>
        )}
      </ZStack>
    );
  }

  if (family === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={2}>
        <HStack spacing={4}>
          <Image systemName={fresh ? 'checkmark.circle.fill' : 'clock.fill'} size={13} />
          <Text modifiers={[font({ size: 13, weight: 'semibold' })]}>
            {fresh ? 'Pantry fresh' : `${count} expiring soon`}
          </Text>
          <Spacer />
        </HStack>
        <Text modifiers={[font({ size: 11 }), lineLimit(1)]}>
          {fresh ? 'Nothing expiring soon' : (soonest ?? '')}
        </Text>
      </VStack>
    );
  }

  // ── Home-screen small / medium: branded, token-driven card ──

  // Placeholder render before the app pushes the first snapshot: keep it
  // system-styled so no brand values need to exist in this bundle.
  if (!props.theme) {
    return <Text>Expiring soon</Text>;
  }

  const c = environment.colorScheme === 'dark' ? props.theme.dark : props.theme.light;

  const header = (
    <HStack spacing={5}>
      <Image systemName="leaf.fill" size={13} color={c.accent} />
      <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(c.ink)]}>
        {props.brandName}
      </Text>
      <Spacer />
    </HStack>
  );

  if (family === 'systemMedium' && !fresh) {
    const rows = props.items ?? [];
    return (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[
          padding({ all: 16 }),
          containerBackground(c.surface, 'widget'),
          widgetURL(props.url),
        ]}
      >
        {header}
        <Spacer minLength={0} />
        {rows.map((item, index) => (
          <HStack key={`${item.name}-${index}`} spacing={8}>
            <Image
              systemName={item.expired ? 'exclamationmark.circle.fill' : 'clock.fill'}
              size={12}
              color={item.expired ? c.expired : c.warning}
            />
            <Text
              modifiers={[font({ size: 14, weight: 'medium' }), foregroundStyle(c.ink), lineLimit(1)]}
            >
              {item.name}
            </Text>
            <Spacer />
            <Text
              modifiers={[
                font({ size: 13, weight: 'semibold' }),
                foregroundStyle(item.expired ? c.expired : c.warning),
              ]}
            >
              {item.label}
            </Text>
          </HStack>
        ))}
        {count > rows.length ? (
          <Text modifiers={[font({ size: 11 }), foregroundStyle(c.inkMuted)]}>
            {`+${count - rows.length} more expiring soon`}
          </Text>
        ) : null}
        <Spacer minLength={0} />
      </VStack>
    );
  }

  // systemSmall (and the fresh systemMedium case): count-first hero card.
  return (
    <VStack
      alignment="leading"
      spacing={4}
      modifiers={[
        padding({ all: 16 }),
        containerBackground(c.surface, 'widget'),
        widgetURL(props.url),
      ]}
    >
      {header}
      <Spacer minLength={0} />
      {fresh ? (
        <VStack alignment="leading" spacing={2}>
          <Text
            modifiers={[
              font({ size: 26, weight: 'bold', design: 'rounded' }),
              foregroundStyle(c.ink),
            ]}
          >
            All fresh
          </Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(c.inkMuted)]}>
            Nothing expiring soon
          </Text>
        </VStack>
      ) : (
        <VStack alignment="leading" spacing={2}>
          <HStack spacing={5}>
            <Text
              modifiers={[
                font({ size: 40, weight: 'bold', design: 'rounded' }),
                foregroundStyle(c.accent),
              ]}
            >
              {count}
            </Text>
            <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(c.inkMuted)]}>
              {count === 1 ? 'item\nexpiring soon' : 'items\nexpiring soon'}
            </Text>
            <Spacer />
          </HStack>
          <Text
            modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle(c.ink), lineLimit(1)]}
          >
            {soonest ?? ''}
          </Text>
        </VStack>
      )}
      <Spacer minLength={0} />
    </VStack>
  );
};

export const ExpiringSoonWidget = createWidget<ExpiringWidgetProps>(
  'ExpiringSoonWidget',
  ExpiringSoonWidgetView,
);
