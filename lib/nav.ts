import {
  LayoutDashboard,
  Users,
  Inbox,
  Calendar,
  BarChart3,
  Briefcase,
  ClipboardCheck,
  Sparkles,
  Wand2,
  Settings,
  HelpCircle,
  LogOut,
  ShieldCheck,
  Building2,
  Video,
  MessageSquare,
  UserCircle,
  FileText,
  Database,
} from 'lucide-react';
import type { Role } from '@/lib/session';

export type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Match only this exact path — used for section index routes. */
  exact?: boolean;
  /** Key into the badge map resolved server-side. */
  badgeKey?:
    | 'pendingRequests'
    | 'verificationQueue'
    | 'upcomingCalls'
    | 'openOpportunities'
    | 'unreadMessages';
  badgeLabel?: string;
};

export type NavGroup = { label: string; items: NavItem[] };

/**
 * Navigation differs by role on purpose: students and alumni are *members* who
 * consume and supply mentorship, the admin *operates* the network. The three
 * sidebars share a shape (Workspace / role tools / General) but almost no
 * destinations.
 */
export const NAV: Record<Role, NavGroup[]> = {
  student: [
    {
      label: 'Workspace',
      items: [
        { label: 'Dashboard', href: '/student', icon: LayoutDashboard, exact: true },
        { label: 'Alumni Directory', href: '/student/directory', icon: Users },
        { label: 'My Requests', href: '/student/requests', icon: Inbox, badgeKey: 'pendingRequests' },
        { label: 'Messages', href: '/student/messages', icon: MessageSquare, badgeKey: 'unreadMessages' },
        { label: 'Opportunities', href: '/student/opportunities', icon: Briefcase, badgeKey: 'openOpportunities' },
        { label: 'Schedule', href: '/student/calendar', icon: Calendar, badgeKey: 'upcomingCalls' },
        { label: 'Video Rooms', href: '/student/calls', icon: Video },
        { label: 'Analytics', href: '/student/analytics', icon: BarChart3 },
      ],
    },
    {
      label: 'Career tools',
      items: [
        { label: 'Readiness Check', href: '/student/assistant', icon: ClipboardCheck, badgeLabel: 'New' },
        { label: 'Outreach Composer', href: '/student/composer', icon: Sparkles },
        { label: 'Smart Matches', href: '/student/suggestions', icon: Wand2 },
      ],
    },
    {
      label: 'General',
      items: [
        { label: 'Settings', href: '/student/settings', icon: Settings },
        { label: 'Help', href: '/student/help', icon: HelpCircle },
        { label: 'Logout', href: '/logout', icon: LogOut },
      ],
    },
  ],

  alumni: [
    {
      label: 'Workspace',
      items: [
        { label: 'Dashboard', href: '/alumni', icon: LayoutDashboard, exact: true },
        { label: 'Request Inbox', href: '/alumni/requests', icon: Inbox, badgeKey: 'pendingRequests' },
        { label: 'Messages', href: '/alumni/messages', icon: MessageSquare, badgeKey: 'unreadMessages' },
        { label: 'My Mentees', href: '/alumni/mentees', icon: Users },
        { label: 'My Postings', href: '/alumni/opportunities', icon: Briefcase },
        { label: 'Schedule', href: '/alumni/calendar', icon: Calendar, badgeKey: 'upcomingCalls' },
        { label: 'Video Rooms', href: '/alumni/calls', icon: Video },
        { label: 'My Impact', href: '/alumni/analytics', icon: BarChart3 },
      ],
    },
    {
      label: 'Giving back',
      items: [
        { label: 'Inbox Triage', href: '/alumni/assistant', icon: ClipboardCheck, badgeLabel: 'New' },
        { label: 'Posting Composer', href: '/alumni/composer', icon: Sparkles },
        { label: 'Students to Help', href: '/alumni/suggestions', icon: Wand2 },
      ],
    },
    {
      label: 'General',
      items: [
        { label: 'My Profile', href: '/alumni/profile', icon: UserCircle },
        { label: 'Settings', href: '/alumni/settings', icon: Settings },
        { label: 'Help', href: '/alumni/help', icon: HelpCircle },
        { label: 'Logout', href: '/logout', icon: LogOut },
      ],
    },
  ],

  admin: [
    {
      label: 'Operations',
      items: [
        { label: 'Overview', href: '/admin', icon: LayoutDashboard, exact: true },
        { label: 'Verification', href: '/admin/verification', icon: ShieldCheck, badgeKey: 'verificationQueue' },
        { label: 'Alumni Records', href: '/admin/records', icon: Database },
        { label: 'People', href: '/admin/users', icon: Users },
        { label: 'Companies', href: '/admin/companies', icon: Building2 },
      ],
    },
    {
      label: 'Network',
      items: [
        { label: 'Requests', href: '/admin/requests', icon: Inbox },
        { label: 'Opportunities', href: '/admin/opportunities', icon: Briefcase },
        { label: 'Sessions', href: '/admin/calendar', icon: Calendar },
        { label: 'Video Rooms', href: '/admin/calls', icon: Video },
        { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
        { label: 'Reports', href: '/admin/reports', icon: FileText },
      ],
    },
    {
      label: 'General',
      items: [
        { label: 'Audit Log', href: '/admin/audit', icon: ShieldCheck },
        { label: 'Settings', href: '/admin/settings', icon: Settings },
        { label: 'Help', href: '/admin/help', icon: HelpCircle },
        { label: 'Logout', href: '/logout', icon: LogOut },
      ],
    },
  ],
};

export const WORKSPACE_LABEL: Record<Role, string> = {
  student: 'Student workspace',
  alumni: 'Alumni workspace',
  admin: 'Admin console',
};

export type NavBadges = Partial<Record<NonNullable<NavItem['badgeKey']>, number>>;
