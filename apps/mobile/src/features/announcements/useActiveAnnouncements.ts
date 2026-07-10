/**
 * Live-queries the household's active announcements (both kinds) plus their
 * reaction rows, newest first. Follows the useQuery pattern in useActivity.ts.
 */
import { useMemo } from 'react';
import { useQuery } from '@powersync/react-native';

import type { AnnouncementRow, AnnouncementReactionRow } from '../../data/powersync/schema';
import { useActiveHousehold } from '../household/ActiveHouseholdContext';

export interface ActiveAnnouncement extends AnnouncementRow {
  reactions: AnnouncementReactionRow[];
}

const QUERY =
  "SELECT * FROM announcements WHERE household_id = ? AND status = 'active' AND deleted = 0 ORDER BY created_at DESC";

const REACTIONS_QUERY =
  'SELECT * FROM announcement_reactions WHERE household_id = ? AND deleted = 0';

export function useActiveAnnouncements(): ActiveAnnouncement[] {
  const { activeHouseholdId } = useActiveHousehold();

  const { data: anns } = useQuery<AnnouncementRow>(QUERY, [activeHouseholdId ?? '']);
  const { data: reactions } = useQuery<AnnouncementReactionRow>(REACTIONS_QUERY, [
    activeHouseholdId ?? '',
  ]);

  return useMemo(
    () =>
      anns.map((a) => ({
        ...a,
        reactions: reactions.filter((r) => r.announcement_id === a.id),
      })),
    [anns, reactions],
  );
}
