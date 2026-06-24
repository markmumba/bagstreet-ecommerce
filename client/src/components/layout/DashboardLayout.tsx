import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
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
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Tag, Package, ClipboardList, Users, LogOut, ShoppingBag } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { useNotificationStream } from '@/hooks/useNotifications';

const navigation = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Categories', href: '/categories', icon: Tag },
  { title: 'Products', href: '/products', icon: Package },
  { title: 'Orders', href: '/orders', icon: ClipboardList },
  { title: 'Users', href: '/users', icon: Users },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  useNotificationStream();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: '/login' });
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const handleLogout = async () => {
    await logout();
    navigate({ to: '/login' });
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar>
          <SidebarContent>
            {/* Brand */}
            <div className="p-6 border-b border-sidebar-border">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <ShoppingBag className="h-4 w-4" />
                </div>
                <div>
                  <h1 className="font-semibold text-sidebar-foreground">Bagstreet</h1>
                  <p className="text-xs text-sidebar-foreground/60">Admin Dashboard</p>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <SidebarGroup>
              <SidebarGroupLabel>Management</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigation.map((item) => {
                    const isActive = location.pathname === item.href;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={isActive}>
                          <Link to={item.href as '/dashboard' | '/categories' | '/products' | '/orders' | '/users'}>
                            <item.icon className="h-4 w-4" />
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
          <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-14 items-center gap-4 px-6">
              <SidebarTrigger />
              <div className="flex-1" />
              {/* User info + logout */}
              <div className="flex items-center gap-3">
                <NotificationBell />
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium leading-none">{user?.full_name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{user?.role}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Logout</span>
                </Button>
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
