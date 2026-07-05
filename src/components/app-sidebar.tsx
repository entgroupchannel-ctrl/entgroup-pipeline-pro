import { Link, useRouterState } from "@tanstack/react-router";
import {
  Kanban,
  List,
  Building2,
  FileText,
  CalendarCheck,
  CalendarHeart,
  LayoutDashboard,
  Settings,
  LogOut,
  Target,
  Mail,
  Crown,
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
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import logoAsset from "@/assets/LOGO_ENTGroup.png.asset.json";

const salesItems = [
  { title: "Pipeline", url: "/pipeline", icon: Kanban },
  { title: "Key Accounts", url: "/key-accounts", icon: Crown },
  { title: "รายการดีล", url: "/leads", icon: List },
  { title: "รายชื่อลูกค้า", url: "/accounts", icon: Building2 },
] as const;

const docItems = [
  { title: "ใบเสนอราคา", url: "/quotations", icon: FileText },
  { title: "ส่งอีเมล", url: "/emails", icon: Mail },
  { title: "กิจกรรม", url: "/activities", icon: CalendarCheck },
  { title: "วันสำคัญ", url: "/events", icon: CalendarHeart },
] as const;

const overviewItems = [
  { title: "KPI", url: "/kpi", icon: Target },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "ตั้งค่า", url: "/settings", icon: Settings },
] as const;

const managerExtraItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "ตั้งค่า", url: "/settings", icon: Settings },
] as const;

const adminFirstItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
] as const;

export function AppSidebar() {
  const { profile, role, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");
  const isAdmin = role === "admin";
  const isManager = role === "manager" || role === "admin";

  const group1 = [...salesItems];
  const group2 = [...docItems];
  let group3: readonly { title: string; url: string; icon: React.ComponentType<{ className?: string }> }[] = [{ title: "KPI", url: "/kpi", icon: Target }];

  if (isAdmin) {
    group3 = [adminFirstItems[0], ...group3, ...overviewItems.slice(2)];
  } else if (isManager) {
    group3 = [...group3, ...managerExtraItems];
  }

  const menuGroups = [group1, group2, group3];

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
        <div className="flex items-center gap-2 px-2 py-2">
          <img
            src={logoAsset.url}
            alt="ENTGROUP"
            className="h-8 w-auto object-contain"
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuGroups.map((group, groupIndex) => (
                <div key={groupIndex} className={groupIndex > 0 ? "border-t pt-2 mt-2" : undefined}>
                  {group.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                        <Link to={item.url}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </div>
              ))}
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
