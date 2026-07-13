/**
 * QuickAddStaples — grouped staple TILES (loaf-mark BrandTile), shared by the
 * Quick Add screen and first-run onboarding. Stateless: the parent owns
 * insertion and the `added` set (which drives the selected ✓ state).
 * `hiddenGroups` lets Quick Add drop sections the user has hidden.
 *
 * `onRefine` (optional): staples whose food has a known kind guide (pasta,
 * rice…) gain a small corner chevron that opens the refine flow — the tile
 * BODY stays instant-add, the chevron is the explicit opt-in. Onboarding
 * omits the prop and renders plain tiles.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';

import { guideFor } from '@breadbox/core';
import { tokens } from '../../theme/tokens';
import { BrandTile } from '../../components/BrandTile';
import { STAPLE_GROUPS, type Staple } from './staples';
import { stapleGlyph } from './stapleArt';

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
          <View style={styles.grid}>
            {group.items.map((s) => {
              const isAdded = added.includes(s.name);
              const refinable = onRefine !== undefined && guideFor(s.name) !== undefined;
              return (
                <View key={s.name} style={styles.cell}>
                  <BrandTile
                    glyph={stapleGlyph(s.name)}
                    label={s.name}
                    selected={isAdded}
                    disabled={isAdded}
                    onPress={() => onAdd(s)}
                    cornerAccessory={
                      refinable ? (
                        <Pressable
                          onPress={() => onRefine?.(s)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Refine ${s.name} — choose kind or brand`}
                          style={styles.refineBtn}
                        >
                          <ChevronDown size={12} color={isAdded ? tokens.color.accent : tokens.color.ink} />
                        </Pressable>
                      ) : undefined
                    }
                  />
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const CELL = '23%'; // 4 per row; grow is capped by maxWidth 25% so ragged last rows stay near full-row width

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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space(2) },
  cell: { flexBasis: CELL, flexGrow: 1, maxWidth: '25%' },
  refineBtn: {
    backgroundColor: tokens.color.surface,
    borderRadius: 999,
    padding: 2,
    opacity: 0.9,
  },
});
