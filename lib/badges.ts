import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { countUpcomingCalls } from '@/lib/calls';
import { unreadCount } from '@/lib/messages';
import { countPendingInvitations } from '@/lib/network';
import { countUpcomingInterviews } from '@/lib/interviews';
import type { NavBadges } from '@/lib/nav';
import type { SessionUser } from '@/lib/session';

/**
 * Counts shown as sidebar badges. Deliberately cheap: every one is a `head`
 * count, so this adds a handful of index lookups rather than row transfers.
 */
export const getNavBadges = cache(async (user: SessionUser): Promise<NavBadges> => {
  const db = createAdminClient();
  const count = async (table: string, build: (q: any) => any) => {
    const { count: n } = await build(db.from(table).select('*', { count: 'exact', head: true }));
    return n ?? 0;
  };

  if (user.role === 'student') {
    const [pendingRequests, openOpportunities, upcomingCalls, unreadMessages, pendingInvitations, unreadNotifications, upcomingInterviews] = await Promise.all([
      count('requests', (q) => q.eq('student_id', user.id).eq('status', 'pending')),
      count('opportunities', (q) => q.eq('is_open', true)),
      countUpcomingCalls(user.id),
      unreadCount(user.id),
      countPendingInvitations(user.id),
      count('notifications', (q) => q.eq('user_id', user.id).is('read_at', null)),
      countUpcomingInterviews(user.id),
    ]);
    return { pendingRequests, openOpportunities, upcomingCalls, unreadMessages, pendingInvitations, unreadNotifications, upcomingInterviews };
  }

  if (user.role === 'alumni') {
    const [pendingRequests, upcomingCalls, unreadMessages, pendingInvitations, unreadNotifications, upcomingInterviews] = await Promise.all([
      count('requests', (q) => q.eq('alumni_id', user.id).eq('status', 'pending')),
      countUpcomingCalls(user.id),
      unreadCount(user.id),
      countPendingInvitations(user.id),
      count('notifications', (q) => q.eq('user_id', user.id).is('read_at', null)),
      countUpcomingInterviews(user.id),
    ]);
    return { pendingRequests, upcomingCalls, unreadMessages, pendingInvitations, unreadNotifications, upcomingInterviews };
  }

  const [verificationQueue, upcomingCalls] = await Promise.all([
    count('alumni_records', (q) => q.eq('claim_status', 'claimed')),
    countUpcomingCalls(user.id),
  ]);
  return { verificationQueue, upcomingCalls };
});
