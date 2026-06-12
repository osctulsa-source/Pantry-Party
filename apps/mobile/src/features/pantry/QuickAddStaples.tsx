/**
 * QuickAddStaples — the grouped staple chips, shared by the Quick Add screen and
 * the first-run onboarding flow. Stateless: the parent owns insertion and the
 * `added` set (which drives the ✓). `hiddenGroups` lets a caller (Quick Add)
 * drop sections the user has hidden; onboarding omits it and shows everything.
 *
 * `onRefine` (optional): when provided, staples whose food has a known kind
 * guide (pasta, rice…) gain a small chevron segment that opens the refine
 * flow — the chip BODY stays instant-add, the chevron is the explicit opt-in.
 * Onboarding omits the prop and renders exactly as before.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';

import { guideFor } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { STAPLE_GROUPS, type Staple } from './staples';

export function QuickAddStaples({
  added,
  onAdd,
  onRefine,
  hiddenGroups = [],
}: {
  added: string[];
  onAdd: (staple: Staple) => void;
  /** Opens the refine flow for a staple with known kinds. Omit to disable (onboarding). */
  onRefine?: (staple: Staple) => void;
  hiddenGroups?: string[];
}) {
  return (
    <View>
      {STAPLE_GROUPS.filter((group) => !hiddenGroups.includes(group.title)).map((group) => (
        <View key={group.title} style={styles.group}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          <View style={styles.chips}>
            {group.items.map((s) => {
              const isAdded = added.includes(s.name);
              const refinable = onRefine !== undefined && guideFor(s.name) !== undefined;
              return (
                <View key={s.name} style={[styles.staple, isAdded && styles.stapleAdded]}>
                  <Pressable onPress={() => onAdd(s)} disabled={isAdded} hitSlop={4}>
                    <Text style={[styles.stapleTxt, isAdded && styles.stapleTxtAdded]}>
                      {isAdded ? `✓ ${s.name}` : `+ ${s.name}`}
                    </Text>
                  </Pressable>
                  {refinable && (
                    <Pressable
                      onPress={() => onRefine?.(s)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Refine ${s.name} — choose kind or brand`}
                      style={styles.refineBtn}
                    >
                      <ChevronDown
                        size={13}
                        color={isAdded ? tokens.color.accent : tokens.color.inkMuted}
                      />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: tokens.space(4) },
  groupTitle: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(2),
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  staple: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: 999,
  },
  stapleAdded: { backgroundColor: tokens.color.accentSoft },
  stapleTxt: { fontFamily: tokens.font.body.medium, fontSize: 13, color: tokens.color.ink },
  stapleTxtAdded: { color: tokens.color.accent },
  refineBtn: {
    marginLeft: tokens.space(2),
    paddingLeft: tokens.space(2),
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: tokens.color.line,
  },
});
