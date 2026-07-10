import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Lightbulb } from 'lucide-react-native';

import { tokens } from '../../theme/tokens';
import { Screen, Caption } from '../../components/ui';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  KITCHEN_TIPS,
  TIP_CATEGORY_META,
  TIP_CATEGORY_ORDER,
  type TipCategory,
} from '@breadbox/core';
import type { RootStackParamList } from '../../../App';

export function TipsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [selected, setSelected] = useState<TipCategory>('cookware');

  const tips = useMemo(
    () => KITCHEN_TIPS.filter((t) => t.category === selected),
    [selected],
  );

  return (
    <Screen>
      <ScreenHeader title="Kitchen tips" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRow}
        style={styles.categoryScroll}
      >
        {TIP_CATEGORY_ORDER.map((cat) => {
          const active = cat === selected;
          return (
            <Pressable
              key={cat}
              onPress={() => setSelected(cat)}
              style={[styles.chip, active && styles.chipSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextSelected]}>
                {TIP_CATEGORY_META[cat].label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {tips.map((tip) => (
          <View key={tip.id} style={styles.card}>
            <View style={styles.cardIcon}>
              <Lightbulb size={16} color={tokens.color.accent} />
            </View>
            <Text style={styles.cardBody}>{tip.body}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  categoryScroll: {
    flexGrow: 0,
    marginBottom: tokens.space(3),
  },
  categoryRow: {
    flexDirection: 'row',
    gap: tokens.space(2),
    paddingHorizontal: tokens.space(6),
    paddingVertical: tokens.space(2),
  },
  chip: {
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    borderRadius: 999,
    backgroundColor: tokens.color.surfaceAlt,
  },
  chipSelected: { backgroundColor: tokens.color.accent },
  chipText: {
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.color.ink,
    lineHeight: 18,
  },
  chipTextSelected: { color: tokens.color.onAccent },
  list: {
    paddingHorizontal: tokens.space(6),
    paddingBottom: tokens.space(10),
    gap: tokens.space(2),
  },
  card: {
    flexDirection: 'row',
    gap: tokens.space(3),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    padding: tokens.space(4),
    alignItems: 'flex-start',
  },
  cardIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: tokens.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  cardBody: {
    flex: 1,
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.ink,
    lineHeight: 20,
  },
});
