/**
 * HouseholdScreen — view of the user's single household and its members.
 *
 * Single-household assumption (PR B of Shared Household): every user gets one
 * household auto-created on first sign-in via ensureDefaultHousehold(). PR C
 * relaxes this when an accepted invite adds a second membership; until then
 * `SELECT * FROM households LIMIT 1` returns at most one row.
 *
 * Member display:
 *   - Current user → real email (from session) + "you" badge
 *   - Other members → "member <first-8-chars-of-uid>"
 *
 * Email enrichment for other members is a deliberate v1 cut: emails live in
 * Supabase auth.users, which isn't streamed via PowerSync. Adding it requires
 * either denormalizing email into user_households on insert or a service-role
 * lookup endpoint — both out of scope for PR B.
 *
 * The Invite-member CTA navigates to the InviteCodeModal, which is responsible
 * for actually firing the /household/invite request on mount.
 */
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@powersync/react-native';

import { tokens } from '../../theme/tokens';
import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../../../App';

type HouseholdNav = NativeStackNavigationProp<RootStackParamList, 'Household'>;

interface HouseholdRow {
  id: string;
  name: string;
  created_by: string;
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
  const currentUserId = authState.status === 'authenticated' ? authState.session.user.id : null;
  const currentUserEmail =
    authState.status === 'authenticated' ? authState.session.user.email ?? null : null;

  const { data: householdRows, isLoading: householdLoading } = useQuery<HouseholdRow>(
    'SELECT * FROM households LIMIT 1',
  );
  const household = householdRows[0];
  const householdId = household?.id ?? '';

  const { data: memberRows, isLoading: membersLoading } = useQuery<MemberRow>(
    'SELECT user_id, role FROM user_households WHERE household_id = ? ORDER BY created_at ASC',
    [householdId],
  );

  if (householdLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
        <View style={styles.loadingState}>
          <ActivityIndicator color={tokens.color.accent} />
        </View>
      </SafeAreaView>
    );
  }

  // Defensive: ensureDefaultHousehold should always provision one, but if the
  // local SQLite cache hasn't caught up yet show a soft state instead of crashing.
  if (!household) {
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
        <View style={styles.header}>
          <Text style={styles.householdName}>{household.name}</Text>
        </View>

        <View style={styles.membersSection}>
          <Text style={styles.eyebrow}>Members</Text>
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

        <Pressable
          style={styles.inviteButton}
          onPress={() => navigation.navigate('InviteCodeModal', { householdId: household.id })}
        >
          <Text style={styles.inviteButtonText}>Invite member</Text>
        </Pressable>
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
  header: {
    marginBottom: tokens.space(6),
  },
  householdName: {
    fontFamily: tokens.font.display.bold,
    fontSize: 32,
    color: tokens.color.ink,
    letterSpacing: -0.5,
  },
  membersSection: {
    flex: 1,
    gap: tokens.space(2),
  },
  eyebrow: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.color.inkMuted,
    marginBottom: tokens.space(2),
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
  inviteButton: {
    paddingVertical: tokens.space(4),
    backgroundColor: tokens.color.accent,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    marginTop: tokens.space(4),
  },
  inviteButtonText: {
    fontFamily: tokens.font.body.semibold,
    fontSize: 16,
    color: tokens.color.surface,
  },
});
