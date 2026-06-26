import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Film,
  FolderOpen,
  Menu,
  Sparkles,
  Plus,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import CinematicLogo from '@/components/common/CinematicLogo';

const NAV_ITEMS = [
  { path: '/', label: 'New Film', icon: Sparkles, exact: true },
  { path: '/library', label: 'My Library', icon: FolderOpen },
];

interface NavItemProps {
  item: (typeof NAV_ITEMS)[0];
  onClick?: () => void;
}

function NavItem({ item, onClick }: NavItemProps) {
  const location = useLocation();
  const isActive = item.exact
    ? location.pathname === item.path
    : location.pathname === item.path || location.pathname.startsWith(item.path + '/');
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all duration-150',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-sm',
        isActive
          ? 'bg-primary/10 text-primary border-l-2 border-primary pl-[10px]'
          : 'text-sidebar-foreground border-l-2 border-transparent'
      )}
    >
      <Icon className="shrink-0" size={16} />
      <span>{item.label}</span>
    </NavLink>
  );
}

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <CinematicLogo size="compact" showIcon />
      </div>

      {/* Film strip decoration */}
      <div className="h-1.5 flex overflow-hidden shrink-0">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className={cn('flex-1 h-full', i % 2 === 0 ? 'bg-primary/30' : 'bg-transparent')}
          />
        ))}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-0.5 px-2">
        <div className="px-3 pb-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Studio
          </span>
        </div>
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.path} item={item} onClick={onNavClick} />
        ))}
      </nav>

      {/* Quick create */}
      <div className="px-3 pb-4">
        <Button
          className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-9 text-xs"
          onClick={() => { navigate('/'); onNavClick?.(); }}
        >
          <Plus size={14} />
          Create New Film
        </Button>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Film size={12} className="text-primary shrink-0" />
          <span>Powered by Genblaze + GMI Cloud</span>
        </div>
      </div>
    </div>
  );
}

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-sidebar border-r border-sidebar-border fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden fixed top-3 left-3 z-40 text-foreground border border-border bg-card"
          >
            <Menu size={18} />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-56 bg-sidebar border-r border-sidebar-border">
          <SidebarContent onNavClick={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex-1 min-w-0 lg:pl-56 flex flex-col">
        {/* Top bar (mobile only) */}
        <div className="lg:hidden flex items-center justify-center h-12 border-b border-border bg-card pl-12 shrink-0">
          <CinematicLogo size="compact" showIcon={false} />
        </div>
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
