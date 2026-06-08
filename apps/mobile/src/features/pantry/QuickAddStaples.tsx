/**
 * QuickAddStaples — the grouped staple chips, shared by the Quick Add screen and
 * the first-run onboarding flow. Stateless: the parent owns insertion and the
 * `added` set (which drives the ✓). `hiddenGroups` lets a caller (Quick Add)
 * drop sections the user has hidden; onboarding omits it and shows everything.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from '../../theme/tokens';
import { STAPLE_GROUPS, type Staple } from './staples';

export function QuickAddStaples({
  added,
  onAdd,
  hiddenGroups = [],
}: {
  added: string[];
  onAdd: (staple: Staple) => void;
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
              return (
                <Pressable
                  key={s.name}
                  onPress={() => onAdd(s)}
                  disabled={isAdded}
                  style={[styles.staple, isAdded && styles.stapleAdded]}
                >
                  <Text style={[styles.stapleTxt, isAdded && styles.stapleTxtAdded]}>
                    {isAdded ? `✓ ${s.name}` : `+ ${s.name}`}
                  </Text>
                </Pressable>
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
    paddingVertical: tokens.space(2),
    paddingHorizontal: tokens.space(3),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: 999,
  },
  stapleAdded: { backgroundColor: tokens.color.accentSoft },
  stapleTxt: { fontFamily: tokens.font.body.medium, fontSize: 13, color: tokens.color.ink },
  stapleTxtAdded: { color: tokens.color.accent },
});
