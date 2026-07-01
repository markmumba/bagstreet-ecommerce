import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { ChevronDown, LayoutDashboard, Tag, Package, ClipboardList, Users, LogOut, Settings, ShoppingBag, Truck, BadgePercent } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { useNotificationStream } from '@/hooks/useNotifications';
import { USER_ROLE } from 'shared';
import type { UserRole } from 'shared';

type NavigationItem = {
  title: string;
  href: '/dashboard' | '/categories' | '/products' | '/orders' | '/promotions' | '/shipping' | '/users';
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  roles: UserRole[];
};

const navigation: NavigationItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: [USER_ROLE.ADMIN] },
  { title: 'Categories', href: '/categories', icon: Tag, roles: [USER_ROLE.ADMIN] },
  { title: 'Products', href: '/products', icon: Package, roles: [USER_ROLE.ADMIN] },
  { title: 'Orders', href: '/orders', icon: ClipboardList, roles: [USER_ROLE.ADMIN, USER_ROLE.MANAGER] },
  { title: 'Promotions', href: '/promotions', icon: BadgePercent, roles: [USER_ROLE.ADMIN] },
  { title: 'Shipping', href: '/shipping', icon: Truck, roles: [USER_ROLE.ADMIN] },
  { title: 'Users', href: '/users', icon: Users, roles: [USER_ROLE.ADMIN] },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
}

function getInitials(name?: string, email?: string) {
  const source = name?.trim() || email?.split('@')[0] || 'User';
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useNotificationStream();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: '/login', replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  const isManager = user?.role === USER_ROLE.MANAGER;
  const isManagerAllowedPage = location.pathname === '/orders';
  const visibleNavigation = navigation.filter((item) => user?.role && item.roles.includes(user.role));

  useEffect(() => {
    if (!isLoading && isAuthenticated && isManager && !isManagerAllowedPage) {
      navigate({ to: '/orders', replace: true });
    }
  }, [isLoading, isAuthenticated, isManager, isManagerAllowedPage, navigate]);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountMenuOpen]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (isManager && !isManagerAllowedPage) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
      </div>
    );
  }

  const handleLogout = async () => {
    setAccountMenuOpen(false);
    await logout();
    navigate({ to: '/login' });
  };

  const handleSettings = () => {
    setAccountMenuOpen(false);
    if (user?.role === USER_ROLE.ADMIN) {
      navigate({ to: '/settings' });
    }
  };

  const userInitials = getInitials(user?.full_name, user?.email);
  const roleLabel = user?.role === USER_ROLE.MANAGER ? 'Manager' : 'Admin';

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar>
          <SidebarContent>
            {/* Brand */}
            <div className="border-b border-sidebar-border p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <ShoppingBag className="h-4 w-4" strokeWidth={1.5} />
                </div>
                <div>
                  <h1 className="text-sm font-semibold text-sidebar-foreground">BagStreet</h1>
                  <p className="text-xs text-[var(--sidebar-fg-muted)]">{roleLabel}</p>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <SidebarGroup>
              <SidebarGroupLabel>Management</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleNavigation.map((item) => {
                    const isActive = location.pathname === item.href;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={isActive}>
                          <Link to={item.href}>
                            <item.icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Top Bar */}
          <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex h-14 items-center gap-4 px-6">
              <SidebarTrigger />
              <div className="flex-1" />
              <div className="flex items-center gap-3">
                <NotificationBell />
                <div ref={accountMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setAccountMenuOpen((open) => !open)}
                    className="flex h-9 items-center gap-2 rounded-full border border-border bg-card px-1.5 pr-2 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/15"
                    aria-haspopup="menu"
                    aria-expanded={accountMenuOpen}
                    aria-label="Open account menu"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">
                      {userInitials}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                  </button>

                  {accountMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-11 z-[100] w-64 overflow-hidden rounded-xl border border-border bg-background shadow-[var(--shadow-dropdown)]"
                    >
                      <div className="border-b border-border px-4 py-3">
                        <p className="truncate text-sm font-medium">{user?.full_name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{user?.email}</p>
                        <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{user?.role}</p>
                      </div>
                      <div className="p-1.5">
                        {user?.role === USER_ROLE.ADMIN && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={handleSettings}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            <Settings className="h-4 w-4" strokeWidth={1.5} />
                            Settings
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleLogout}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                        >
                          <LogOut className="h-4 w-4" strokeWidth={1.5} />
                          Logout
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <div className="flex-1">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
