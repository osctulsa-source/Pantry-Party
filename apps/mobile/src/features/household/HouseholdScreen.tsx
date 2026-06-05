/**
 * HouseholdScreen — list-+-detail view of the user's households.
 *
 * PR C restructure (replacing the PR B single-household view):
 *   - Top: "Your households" — every household the user belongs to as a
 *     tappable card. The active card has an accent border and a checkmark.
 *     Tapping a non-active card switches active via ActiveHouseholdContext;
 *     the member list below re-queries automatically.
 *   - Middle: "Members of {activeHousehold.name}" — same member-row logic as
 *     PR B (current user by email, others by `member <first-8-chars>`),
 *     scoped to whichever household is currently active.
 *   - Bottom: "Invite member" (existing) + "Join another household" (new entry
 *     point to JoinHouseholdScreen).
 *
 * The layout intentionally does NOT branch on household count — even users
 * with a single household see the list section (with one card, marked active).
 * Keeping a stable layout avoids the cognitive cost of a UI that mutates as
 * users invite/accept.
 *
 * Email enrichment for non-current members remains a v1 cut (see PR B note):
 * emails live in Supabase auth.users and aren't streamed via PowerSync.
 */
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@powersync/react-native';

import { tokens } from '../../theme/tokens';
import { useAuth } from '../auth/AuthContext';
import { useActiveHousehold } from './ActiveHouseholdContext';
import type { RootStackParamList } from '../../../App';

type HouseholdNav = NativeStackNavigationProp<RootStackParamList, 'Household'>;

interface HouseholdRow {
  id: string;
  name: string;
  created_by: string;
  member_count: number;
}

interface MemberRow {
  user_id: string;
  role: string;
}

interface DisplayMember {
  userId: string;
  role: string;
  isCurrentUser: boolean;
  label: string;
}

export function HouseholdScreen() {
  const navigation = useNavigation<HouseholdNav>();
  const { state: authState } = useAuth();
  const { activeHouseholdId, setActiveHouseholdId, isLoading: activeLoading } =
    useActiveHousehold();

  const currentUserId = authState.status === 'authenticated' ? authState.session.user.id : null;
  const currentUserEmail =
    authState.status === 'authenticated' ? authState.session.user.email ?? null : null;

  // All households the user belongs to. Member count comes from a correlated
  // subquery so we don't need a second reactive query just for the badge.
  const { data: householdRows, isLoading: householdsLoading } = useQuery<HouseholdRow>(
    `SELECT h.id, h.name, h.created_by,
            (SELECT COUNT(*) FROM user_households uh2 WHERE uh2.household_id = h.id) AS member_count
     FROM households h
     JOIN user_households uh ON uh.household_id = h.id
     WHERE uh.user_id = ?
     ORDER BY h.created_at DESC`,
    [currentUserId ?? ''],
  );

  const activeHousehold = householdRows.find((h) => h.id === activeHouseholdId) ?? null;
  const activeIdForMembers = activeHousehold?.id ?? '';

  const { data: memberRows, isLoading: membersLoading } = useQuery<MemberRow>(
    'SELECT user_id, role FROM user_households WHERE household_id = ? ORDER BY created_at ASC',
    [activeIdForMembers],
  );

  // While auth/active bootstrap or the household list is still resolving,
  // show a soft loading state instead of an empty layout flash.
  if (activeLoading || householdsLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
        <View style={styles.loadingState}>
          <ActivityIndicator color={tokens.color.accent} />
        </View>
      </SafeAreaView>
    );
  }

  // Defensive: ensureDefaultHousehold should always provision one, but if the
  // local SQLite cache hasn't caught up yet show a soft state instead of
  // crashing on the empty list.
  if (householdRows.length === 0) {
    return (
      <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
        <View style={styles.loadingState}>
          <ActivityIndicator color={tokens.color.accent} />
          <Text style={styles.caption}>Setting up your household...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const members: DisplayMember[] = memberRows.map((row) => {
    const isCurrentUser = row.user_id === currentUserId;
    const label = isCurrentUser
      ? currentUserEmail ?? 'You'
      : `member ${row.user_id.slice(0, 8)}`;
    return {
      userId: row.user_id,
      role: row.role,
      isCurrentUser,
      label,
    };
  });

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.householdsSection}>
          <Text style={styles.eyebrow}>Your households</Text>
          {householdRows.map((h) => {
            const isActive = h.id === activeHouseholdId;
            return (
              <Pressable
                key={h.id}
                style={[styles.householdCard, isActive && styles.householdCardActive]}
                onPress={() => {
                  if (!isActive) setActiveHouseholdId(h.id);
                }}
              >
                <View style={styles.householdCardMain}>
                  <Text style={styles.householdCardName} numberOfLines={1}>
                    {h.name}
                  </Text>
                  <Text style={styles.householdCardMeta}>
                    {h.member_count} {h.member_count === 1 ? 'member' : 'members'}
                  </Text>
                </View>
                {isActive && (
                  <Text style={styles.activeCheck} accessibilityLabel="Active household">
                    ✓
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.membersSection}>
          <Text style={styles.eyebrow}>
            Members of {activeHousehold?.name ?? '...'}
          </Text>
          {membersLoading ? (
            <ActivityIndicator color={tokens.color.accent} style={styles.membersLoading} />
          ) : (
            <FlatList
              data={members}
              keyExtractor={(m) => m.userId}
              renderItem={({ item }) => <MemberRowView member={item} />}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListFooterComponent={
                <Text style={styles.memberCount}>
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </Text>
              }
            />
          )}
        </View>

        <View style={styles.actions}>
          <Pressable
            style={styles.inviteButton}
            onPress={() => {
              if (activeHousehold) {
                navigation.navigate('InviteCodeModal', { householdId: activeHousehold.id });
              }
            }}
            disabled={!activeHousehold}
          >
            <Text style={styles.inviteButtonText}>Invite member</Text>
          </Pressable>
          <Pressable
            style={styles.joinButton}
            onPress={() => navigation.navigate('JoinHousehold')}
          >
            <Text style={styles.joinButtonText}>Join another household</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function MemberRowView({ member }: { member: DisplayMember }) {
  return (
    <View style={styles.memberRow}>
      <View style={styles.memberLabelGroup}>
        <Text style={styles.memberLabel} numberOfLines={1}>
          {member.label}
        </Text>
        {member.isCurrentUser && (
          <View style={styles.youBadge}>
            <Text style={styles.youBadgeText}>you</Text>
          </View>
        )}
      </View>
      <Text style={styles.memberRole}>{member.role}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface,
  },
  content: {
    flex: 1,
    paddingHorizontal: tokens.space(6),
    paddingTop: tokens.space(4),
    paddingBottom: tokens.space(6),
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space(3),
  },
  caption: {
    fontFamily: tokens.font.body.regular,
    fontSize: 14,
    color: tokens.color.inkMuted,
  },
  householdsSection: {
    gap: tokens.space(2),
    marginBottom: tokens.space(6),
  },
  eyebrow: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(2),
  },
  householdCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.space(3),
    paddingHorizontal: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: tokens.space(3),
  },
  householdCardActive: {
    borderColor: tokens.color.accent,
  },
  householdCardMain: {
    flex: 1,
  },
  householdCardName: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 16,
    color: tokens.color.ink,
  },
  householdCardMeta: {
    marginTop: 2,
    fontFamily: tokens.font.body.regular,
    fontSize: 12,
    color: tokens.color.inkMuted,
  },
  activeCheck: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 18,
    color: tokens.color.accent,
  },
  membersSection: {
    flex: 1,
    gap: tokens.space(2),
  },
  membersLoading: {
    marginTop: tokens.space(4),
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.space(3),
    gap: tokens.space(3),
  },
  memberLabelGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space(2),
  },
  memberLabel: {
    flexShrink: 1,
    fontFamily: tokens.font.body.regular,
    fontSize: 16,
    color: tokens.color.ink,
  },
  youBadge: {
    paddingHorizontal: tokens.space(2),
    paddingVertical: tokens.space(1) / 2,
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.sm,
  },
  youBadgeText: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 11,
    color: tokens.color.inkMuted,
    textTransform: 'lowercase',
  },
  memberRole: {
    fontFamily: tokens.font.body.medium,
    fontSize: 13,
    color: tokens.color.inkMuted,
    textTransform: 'lowercase',
  },
  separator: {
    height: 1,
    backgroundColor: tokens.color.surfaceAlt,
  },
  memberCount: {
    fontFamily: tokens.font.body.regular,
    fontSize: 13,
    color: tokens.color.inkMuted,
    paddingTop: tokens.space(4),
  },
  actions: {
    gap: tokens.space(3),
    marginTop: tokens.space(4),
  },
  inviteButton: {
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  inviteButtonText: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 16,
    color: tokens.color.surface,
  },
  joinButton: {
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  joinButtonText: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 16,
    color: tokens.color.accent,
  },
});
