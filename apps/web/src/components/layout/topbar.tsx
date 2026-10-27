import { ChevronDown, KeyRound, LogOut, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChangePasswordDialog } from "@/modules/auth/change-password-dialog";
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

const tabClassName =
  "flex shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset";

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
  return (
    <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-background/85 px-3 pt-2 backdrop-blur-lg sm:px-4 lg:flex-nowrap lg:px-5 lg:pt-0">
      <div className="flex min-w-0 flex-1 items-center gap-2 lg:flex-none">
        <Button
          type="button"
          variant="ghost"
          size="icon"
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
          size="icon"
          className="hidden lg:inline-flex"
          aria-label={isSidebarCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
          aria-expanded={!isSidebarCollapsed}
          onClick={onToggleSidebar}
        >
          {isSidebarCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
        </Button>
        <ProgramSwitcher />
      </div>

      <span aria-hidden="true" className="hidden h-6 w-px bg-border lg:block" />

      <ModuleTabs sections={navigationSections} activeSectionId={activeSectionId} />

      <div className="flex shrink-0 items-center gap-1">
        <PersonalNotificationsDialog accessToken={accessToken} />
        <UserMenu user={user} accessToken={accessToken} onSignOut={onSignOut} />
      </div>
    </header>
  );
}

function ProgramSwitcher() {
  const { programs, selectedProgramId, isLoading, selectProgram } = useInstitutionProgram();

  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[11px] leading-4 font-medium text-muted-foreground">Chương trình</span>
      <Select value={selectedProgramId ?? undefined} onValueChange={selectProgram} disabled={isLoading || programs.length === 0}>
        <SelectTrigger
          aria-label="Chọn chương trình"
          className="-mx-1 h-6 w-auto max-w-56 gap-1 border-0 bg-transparent px-1 py-0 text-sm font-semibold text-foreground shadow-none focus-visible:ring-2 xl:max-w-72 dark:bg-transparent"
        >
          <SelectValue placeholder={isLoading ? "Đang tải chương trình..." : "Chưa có chương trình"} />
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="start"
          sideOffset={6}
          className="w-auto max-w-[min(28rem,calc(100vw-2rem))] min-w-64"
        >
          {programs.map((program) => (
            <SelectItem key={program.id} value={program.id} className="py-2">
              {program.institutionName} - {program.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type ModuleTabsProps = {
  sections: NavigationSection[];
  activeSectionId?: string;
};

/**
 * Shows as many module tabs as fit; the rest move into a "Thêm" menu so the header
 * never scrolls horizontally. The active module always stays visible.
 */
function ModuleTabs({ sections, activeSectionId }: ModuleTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const sectionsKey = sections.map((section) => section.id).join("|");
  const [visibleKey, setVisibleKey] = useState(sectionsKey);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const update = () => {
      const ids = sectionsKey ? sectionsKey.split("|") : [];
      const nodes = Array.from(measure.children) as HTMLElement[];
      const widths = nodes.slice(0, ids.length).map((node) => node.offsetWidth);
      const moreWidth = nodes[ids.length]?.offsetWidth ?? 0;
      const available = container.clientWidth;

      if (widths.reduce((sum, width) => sum + width, 0) <= available) {
        setVisibleKey(sectionsKey);
        return;
      }

      const activeIndex = ids.indexOf(activeSectionId ?? "");
      let used = moreWidth + (activeIndex >= 0 ? widths[activeIndex] : 0);
      let isFull = false;
      const visible = ids.filter((id, index) => {
        if (index === activeIndex) return true;
        if (isFull || used + widths[index] > available) {
          isFull = true;
          return false;
        }
        used += widths[index];
        return true;
      });
      setVisibleKey(visible.join("|"));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [sectionsKey, activeSectionId]);

  const visibleIds = new Set(visibleKey.split("|"));
  const visibleSections = sections.filter((section) => visibleIds.has(section.id));
  const overflowSections = sections.filter((section) => !visibleIds.has(section.id));

  return (
    <nav
      ref={containerRef}
      aria-label="Phân hệ chức năng"
      className="relative order-last flex h-11 min-w-0 basis-full items-stretch overflow-hidden lg:order-none lg:h-14 lg:flex-1 lg:basis-auto"
    >
      <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute top-0 left-0 flex w-max">
        {sections.map((section) => (
          <span key={section.id} className={cn(tabClassName, "border-transparent")}>
            {section.label}
          </span>
        ))}
        <span className={cn(tabClassName, "gap-1 border-transparent")}>
          Thêm <ChevronDown className="size-4" />
        </span>
      </div>

      {visibleSections.map((section) => {
        const isActive = section.id === activeSectionId;
        return (
          <NavLink
            key={section.id}
            to={getDefaultSectionHref(section)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              tabClassName,
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {section.label}
          </NavLink>
        );
      })}

      {overflowSections.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              tabClassName,
              "gap-1 border-transparent text-muted-foreground hover:text-foreground data-[state=open]:text-foreground",
            )}
          >
            Thêm <ChevronDown aria-hidden="true" className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            {overflowSections.map((section) => (
              <DropdownMenuItem key={section.id} asChild>
                <NavLink to={getDefaultSectionHref(section)}>{section.label}</NavLink>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
}

function UserMenu({ user, accessToken, onSignOut }: { user: AuthUser; accessToken: string; onSignOut: () => void }) {
  const [isChangePasswordOpen, setChangePasswordOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Tài khoản ${user.fullName}`}
          className="flex min-w-0 items-center gap-2 rounded-full p-1 transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-accent xl:rounded-lg xl:pr-2"
        >
          <Avatar>
            <AvatarImage src={user.avatarUrl ?? undefined} alt="" />
            <AvatarFallback className="text-xs">{getInitials(user.fullName)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate text-sm font-medium xl:block">{user.fullName}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="w-60">
          <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
            <span className="truncate text-sm font-medium">{user.fullName}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setChangePasswordOpen(true)}>
            <KeyRound aria-hidden="true" />
            Đổi mật khẩu
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onSignOut}>
            <LogOut aria-hidden="true" />
            Đăng xuất
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={isChangePasswordOpen} onOpenChange={setChangePasswordOpen} accessToken={accessToken} email={user.email} />
    </>
  );
}
