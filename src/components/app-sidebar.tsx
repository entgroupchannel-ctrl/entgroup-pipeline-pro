import { Link, useRouterState } from "@tanstack/react-router";
import {
  KanbanSquare,
  List,
  Building2,
  FileText,
  CalendarCheck,
  BarChart2,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const navItems = [
  { title: "Pipeline", url: "/pipeline", icon: KanbanSquare },
  { title: "รายการดีล", url: "/leads", icon: List },
  { title: "บริษัท", url: "/accounts", icon: Building2 },
  { title: "ใบเสนอราคา", url: "/quotations", icon: FileText },
  { title: "กิจกรรม", url: "/activities", icon: CalendarCheck },
] as const;

const managerItems = [
  { title: "Dashboard", url: "/dashboard", icon: BarChart2 },
] as const;

export function AppSidebar() {
  const { toggleSidebar, state } = useSidebar();
  const collapsed = state === "collapsed";
  const { profile, role, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");
  const isManager = role === "manager" || role === "admin";

  const initials = (profile?.full_name ?? "?")
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <KanbanSquare className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold leading-tight">ENTGROUP</span>
            <span className="text-xs text-muted-foreground leading-tight">CRM</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 group-data-[collapsible=icon]:hidden"
            onClick={toggleSidebar}
            title="ย่อเมนู"
            aria-label="ย่อเมนู"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
        <div className="hidden px-1 pb-1 group-data-[collapsible=icon]:block">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleSidebar}
            title="ขยายเมนู"
            aria-label="ขยายเมนู"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        </div>
      </SidebarHeader>


      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {isManager &&
                managerItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <Link to={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/settings")} tooltip="ตั้งค่า">
                  <Link to="/settings">
                    <Settings />
                    <span>ตั้งค่า</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <div className="flex items-center gap-2 px-1 py-1">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium">{profile?.full_name ?? "-"}</span>
            <span className="truncate text-xs text-muted-foreground capitalize">{role ?? ""}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 group-data-[collapsible=icon]:hidden"
            onClick={() => signOut()}
            title="ออกจากระบบ"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
