import { LogOut, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NavLink } from "react-router-dom";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useInstitutionProgram } from "@/modules/institutions/institution-program-context";
import { PersonalNotificationsDialog } from "@/modules/notifications/components/personal-notifications-dialog";
import type { AuthUser } from "@/types/auth";
import { getDefaultSectionHref, type NavigationSection } from "./navigation";

type TopbarProps = {
  user: AuthUser;
  accessToken: string;
  navigationSections: NavigationSection[];
  activeSectionId?: string;
  isNavigationOpen: boolean;
  isSidebarCollapsed: boolean;
  onToggleNavigation: () => void;
  onToggleSidebar: () => void;
  onSignOut: () => void;
};

function getInitials(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function Topbar({
  user,
  accessToken,
  navigationSections,
  activeSectionId,
  isNavigationOpen,
  isSidebarCollapsed,
  onToggleNavigation,
  onToggleSidebar,
  onSignOut,
}: TopbarProps) {
  const { programs, selectedProgramId, isLoading, selectProgram } = useInstitutionProgram();

  return (
    <header className="sticky top-0 z-20 flex min-h-20 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-background/85 px-4 py-2 backdrop-blur-lg sm:px-6 lg:flex-nowrap lg:px-8 lg:py-0">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="lg:hidden"
          aria-label={isNavigationOpen ? "Đóng menu điều hướng" : "Mở menu điều hướng"}
          aria-controls="mobile-navigation"
          aria-expanded={isNavigationOpen}
          onClick={onToggleNavigation}
        >
          <Menu aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="hidden lg:inline-flex"
          aria-label={isSidebarCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
          aria-expanded={!isSidebarCollapsed}
          onClick={onToggleSidebar}
        >
          {isSidebarCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
        </Button>
        <div className="min-w-0 sm:min-w-72 lg:min-w-96">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Chương trình đang làm việc
          </p>
          <Select value={selectedProgramId ?? undefined} onValueChange={selectProgram} disabled={isLoading || programs.length === 0}>
            <SelectTrigger aria-label="Chọn chương trình đang làm việc" className="mt-1 h-8 w-full border-0 bg-transparent px-0 text-base font-semibold shadow-none focus-visible:ring-0">
              <SelectValue placeholder={isLoading ? "Đang tải chương trình..." : "Chưa có chương trình"} />
            </SelectTrigger>
            <SelectContent>
              {programs.map((program) => (
                <SelectItem key={program.id} value={program.id}>
                  {program.institutionName} - {program.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <nav className="order-last flex min-w-0 basis-full items-stretch overflow-x-auto lg:order-0 lg:flex-1 lg:basis-auto lg:self-stretch" aria-label="Phân hệ chức năng">
        {navigationSections.map((section) => {
          const isActive = section.id === activeSectionId;
          return (
            <NavLink
              key={section.id}
              to={getDefaultSectionHref(section)}
              className={cn(
                "flex min-h-11 shrink-0 items-center border-b-2 px-4 text-sm font-medium transition-colors lg:px-5",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {section.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="flex items-center gap-3">
        <PersonalNotificationsDialog accessToken={accessToken} />
        <Avatar size="lg" className="hidden sm:flex">
          <AvatarImage src={user.avatarUrl ?? undefined} alt="" />
          <AvatarFallback>{getInitials(user.fullName)}</AvatarFallback>
        </Avatar>
        <div className="hidden min-w-0 text-left sm:block">
          <p className="max-w-56 truncate text-sm font-medium">{user.fullName}</p>
          <p className="max-w-56 truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <Separator orientation="vertical" className="hidden h-8 sm:block" />
        <Button type="button" variant="ghost" onClick={onSignOut} aria-label="Đăng xuất">
          <LogOut aria-hidden="true" />
          <span className="hidden sm:inline">Đăng xuất</span>
        </Button>
      </div>
    </header>
  );
}
