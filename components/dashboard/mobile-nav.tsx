'use client';

import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Sidebar } from '@/components/dashboard/sidebar';
import { WORKSPACE_LABEL, type NavBadges } from '@/lib/nav';
import type { Role } from '@/lib/session';

export function MobileNav({ role, badges }: { role: Role; badges?: NavBadges }) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg lg:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </Button>
        }
      />
      <SheetContent side="left" className="w-60! max-w-60! gap-0 p-0" showCloseButton={false}>
        <SheetTitle className="sr-only">{WORKSPACE_LABEL[role]} navigation</SheetTitle>
        {/* The sidebar positions itself fixed; inside the sheet it should flow. */}
        <div className="relative h-full [&>aside]:static [&>aside]:h-full [&>aside]:w-full [&>aside]:border-r-0">
          <Sidebar role={role} badges={badges} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
