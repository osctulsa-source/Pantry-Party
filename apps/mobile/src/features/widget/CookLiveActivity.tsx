/**
 * Cook Live Activity — the running cook session on the lock screen and in the
 * Dynamic Island. Rendered by the generic WidgetLiveActivity already inside
 * the shipped expo-widgets extension, so this layout is OTA-shippable.
 *
 * Widget-runtime rules (same as ExpiringSoonWidget): the function body is
 * serialized and evaluated in the extension — everything it needs must arrive
 * via props or be defined inline; only @expo/ui primitives.
 *
 * The countdown/progress use timerInterval so the SYSTEM ticks them — the app
 * only pushes props on discrete events (start/pause/step change/finish).
 */
import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

import type { CookActivitySnapshot } from './cookActivitySnapshot';
import type { WidgetThemePair } from './widgetTheme';

export interface CookActivityProps extends CookActivitySnapshot {
  brandName: string;
  theme: WidgetThemePair;
}

const CookLiveActivityView = (props: CookActivityProps, environment: LiveActivityEnvironment) => {
  'widget';
  const c = environment.colorScheme === 'dark' ? props.theme.dark : props.theme.light;
  const hero = props.soonest;
  const extra = props.timerCount - 1;

  const clock = (size: number, weight: 'bold' | 'semibold') =>
    hero ? (
      <Text
        timerInterval={{ lower: new Date(hero.startedAt), upper: new Date(hero.endsAt) }}
        countsDown
        modifiers={[font({ size, weight, design: 'rounded' }), foregroundStyle(c.accent)]}
      />
    ) : (
      <Text modifiers={[font({ size, weight, design: 'rounded' }), foregroundStyle(c.inkMuted)]}>
        {props.pausedRemainingSec !== null
          ? `${Math.floor(props.pausedRemainingSec / 60)}:${String(props.pausedRemainingSec % 60).padStart(2, '0')} paused`
          : props.stepLabel}
      </Text>
    );

  const banner = (
    <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 14 })]}>
      <HStack spacing={5}>
        <Image systemName="frying.pan.fill" size={13} color={c.accent} />
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(c.inkMuted)]}>
          {props.brandName}
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(c.inkMuted)]}>
          {props.stepLabel}
        </Text>
      </HStack>
      <HStack spacing={8}>
        <VStack alignment="leading" spacing={2}>
          <Text
            modifiers={[font({ size: 16, weight: 'semibold' }), foregroundStyle(c.ink), lineLimit(1)]}
          >
            {props.recipeTitle}
          </Text>
          {hero ? (
            <Text modifiers={[font({ size: 12 }), foregroundStyle(c.inkMuted)]}>
              {extra > 0 ? `${hero.stepLabel} timer · +${extra} more` : `${hero.stepLabel} timer`}
            </Text>
          ) : (
            <Text modifiers={[font({ size: 12 }), foregroundStyle(c.inkMuted)]}>
              {props.timerCount > 0 ? 'Timers paused' : 'Cooking along'}
            </Text>
          )}
        </VStack>
        <Spacer />
        {clock(28, 'bold')}
      </HStack>
      {hero ? (
        <ProgressView
          timerInterval={{ lower: new Date(hero.startedAt), upper: new Date(hero.endsAt) }}
          countsDown
        />
      ) : null}
    </VStack>
  );

  return {
    banner,
    compactLeading: <Image systemName="timer" size={14} color={c.accent} />,
    compactTrailing: clock(14, 'semibold'),
    minimal: <Image systemName="timer" size={14} color={c.accent} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ leading: 6 })]}>
        <Text
          modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(c.ink), lineLimit(1)]}
        >
          {props.recipeTitle}
        </Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(c.inkMuted)]}>{props.stepLabel}</Text>
      </VStack>
    ),
    expandedTrailing: clock(22, 'bold'),
    expandedBottom: hero ? (
      <ProgressView
        timerInterval={{ lower: new Date(hero.startedAt), upper: new Date(hero.endsAt) }}
        countsDown
      />
    ) : null,
  };
};

export const CookLiveActivity = createLiveActivity<CookActivityProps>(
  'CookLiveActivity',
  CookLiveActivityView,
);
