'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Header } from '@/components/dashboard/header';
import { HelpBot } from '@/components/chat/help-bot';
import type { NavBadges } from '@/lib/nav';
import type { Role } from '@/lib/session';

const COLLAPSE_KEY = 'sjcem.sidebar.collapsed';

/**
 * The single console layout shared by all three roles: a collapsible sidebar
 * plus a header carrying search, notifications and the page title. What differs
 * between roles is the nav set and the page content, not the chrome.
 */
export function DashboardShell({
  user,
  badges = {},
  title,
  description,
  actions,
  children,
}: {
  user: { full_name: string; email: string; role: Role };
  badges?: NavBadges;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Restore the collapse preference after mount so the server and client agree
  // on the first paint.
  useEffect(() => {
    try {
      setIsCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* storage unavailable — keep the default */
    }
  }, []);

  function toggle() {
    setIsCollapsed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar role={user.role} badges={badges} isCollapsed={isCollapsed} onToggle={toggle} />
      </div>

      <main
        className={cn(
          'flex-1 p-4 transition-all duration-300 md:p-5 lg:p-6',
          isCollapsed ? 'lg:ml-16' : 'lg:ml-60'
        )}
      >
        <Header
          title={title}
          description={description}
          actions={actions}
          user={user}
          badges={badges}
        />
        <div className="mt-4 space-y-4 md:mt-5">{children}</div>
      </main>

      <HelpBot role={user.role} />
    </div>
  );
}
