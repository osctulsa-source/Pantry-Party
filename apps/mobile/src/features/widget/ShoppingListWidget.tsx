/**
 * "Shopping List" widget — home-screen small / medium / large families,
 * written in TypeScript via expo-widgets.
 *
 * Small: how many items are still to buy. Medium/large: the list itself,
 * newest first, so a glance at the home screen replaces opening the app in
 * the store aisle. Tap anywhere → the Shopping tab (deep link via props.url).
 *
 * Same isolation rules as ExpiringSoonWidget: only @expo/ui primitives, all
 * constants inline, colors + brand name arrive through props from the token
 * layer (never hardcoded here).
 */
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { ShoppingWidgetItem } from './shoppingSnapshot';
import type { WidgetThemePair } from './widgetTheme';

export interface ShoppingWidgetProps {
  uncheckedCount: number;
  items: ShoppingWidgetItem[];
  brandName: string;
  /** Deep link the widget opens on tap (built app-side; the scheme lives there). */
  url: string;
  theme: WidgetThemePair;
}

const ShoppingListWidgetView = (props: ShoppingWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const count = props.uncheckedCount ?? 0;
  const family = environment.widgetFamily;

  // Placeholder render before the app pushes the first snapshot.
  if (!props.theme) {
    return <Text>Shopping list</Text>;
  }

  const c = environment.colorScheme === 'dark' ? props.theme.dark : props.theme.light;

  const header = (
    <HStack spacing={5}>
      <Image systemName="basket.fill" size={13} color={c.accent} />
      <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(c.ink)]}>
        {props.brandName}
      </Text>
      <Spacer />
    </HStack>
  );

  const cardModifiers = [
    padding({ all: 16 }),
    containerBackground(c.surface, 'widget'),
    widgetURL(props.url),
  ];

  if (family === 'systemSmall' || count === 0) {
    return (
      <VStack alignment="leading" spacing={4} modifiers={cardModifiers}>
        {header}
        <Spacer minLength={0} />
        {count === 0 ? (
          <VStack alignment="leading" spacing={2}>
            <Text
              modifiers={[
                font({ size: 26, weight: 'bold', design: 'rounded' }),
                foregroundStyle(c.ink),
              ]}
            >
              All set
            </Text>
            <Text modifiers={[font({ size: 12 }), foregroundStyle(c.inkMuted)]}>
              Nothing left to buy
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
              <Text
                modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(c.inkMuted)]}
              >
                {count === 1 ? 'item\nto buy' : 'items\nto buy'}
              </Text>
              <Spacer />
            </HStack>
            <Text
              modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle(c.ink), lineLimit(1)]}
            >
              {props.items && props.items[0] ? props.items[0].name : ''}
            </Text>
          </VStack>
        )}
        <Spacer minLength={0} />
      </VStack>
    );
  }

  // Medium shows up to 4 rows, large up to 9 (the snapshot cap).
  const maxRows = family === 'systemMedium' ? 4 : 9;
  const rows = (props.items ?? []).slice(0, maxRows);
  const overflow = count - rows.length;

  return (
    <VStack alignment="leading" spacing={6} modifiers={cardModifiers}>
      <HStack spacing={5}>
        <Image systemName="basket.fill" size={13} color={c.accent} />
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(c.ink)]}>
          {props.brandName}
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(c.inkMuted)]}>
          {count === 1 ? '1 item' : `${count} items`}
        </Text>
      </HStack>
      <Spacer minLength={0} />
      {rows.map((item, index) => (
        <HStack key={`${item.name}-${index}`} spacing={8}>
          <Image systemName="circle" size={11} color={c.inkMuted} />
          <Text
            modifiers={[font({ size: 14, weight: 'medium' }), foregroundStyle(c.ink), lineLimit(1)]}
          >
            {item.name}
          </Text>
          <Spacer />
          {item.detail ? (
            <Text modifiers={[font({ size: 12 }), foregroundStyle(c.inkMuted)]}>
              {item.detail}
            </Text>
          ) : null}
        </HStack>
      ))}
      {overflow > 0 ? (
        <Text modifiers={[font({ size: 11 }), foregroundStyle(c.inkMuted)]}>
          {`+${overflow} more on the list`}
        </Text>
      ) : null}
      <Spacer minLength={0} />
    </VStack>
  );
};

export const ShoppingListWidget = createWidget<ShoppingWidgetProps>(
  'ShoppingListWidget',
  ShoppingListWidgetView,
);
