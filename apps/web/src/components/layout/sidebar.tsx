import { ChevronDown, GraduationCap } from "lucide-react";
import { useId, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  isNavigationGroup,
  isNavigationLink,
  type NavigationGroupItem,
  type NavigationItem,
  type NavigationLinkItem,
} from "./navigation";

type SidebarProps = {
  items: NavigationItem[];
  sectionLabel?: string;
  className?: string;
  onNavigate?: () => void;
  isCollapsed?: boolean;
  onExpand?: () => void;
};

export function Sidebar({ items, sectionLabel = "Chức năng", className, onNavigate, isCollapsed = false, onExpand }: SidebarProps) {
  const overviewItem = items.find(
    (item): item is NavigationLinkItem => isNavigationLink(item) && item.href === "/tong-quan",
  );
  const sectionItems = items.filter(
    (item) => !(isNavigationLink(item) && item.href === "/tong-quan"),
  );

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r bg-card text-card-foreground transition-[width] duration-200",
        isCollapsed ? "w-20" : "w-72",
        className,
      )}
      aria-label="Thanh điều hướng"
    >
      <div className={cn("flex h-20 items-center gap-3 px-5", isCollapsed && "justify-center px-0")}>
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <GraduationCap aria-hidden="true" />
        </span>
        <div className={cn("flex min-w-0 flex-col gap-1", isCollapsed && "hidden")}>
          <p className="truncate text-sm font-semibold">Admission CRM</p>
          <Badge variant="secondary" className="rounded-md">
            Quản lý tuyển sinh
          </Badge>
        </div>
      </div>
      <Separator />

      <nav className={cn("flex-1 overflow-y-auto px-3 py-6", isCollapsed && "px-2")} aria-label="Điều hướng chính">
        {overviewItem && (
          <>
            <p className={cn("mb-3 px-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground", isCollapsed && "sr-only")}>
              Tổng quan
            </p>
            <NavigationLink item={overviewItem} onNavigate={onNavigate} isCollapsed={isCollapsed} />
          </>
        )}

        {sectionItems.length > 0 && (
          <p className={cn("mb-3 px-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground", overviewItem && "mt-8", isCollapsed && "sr-only")}>
            {sectionLabel}
          </p>
        )}
        {sectionItems.length > 0 ? (
          sectionItems.map((item) =>
            isNavigationGroup(item) ? (
              <NavigationGroup key={item.label} item={item} onNavigate={onNavigate} isCollapsed={isCollapsed} onExpand={onExpand} />
            ) : (
              <NavigationLink key={item.href} item={item} onNavigate={onNavigate} isCollapsed={isCollapsed} />
            ),
          )
        ) : !overviewItem ? (
          <p className={cn("mx-3 rounded-lg border border-dashed p-3 text-xs leading-5 text-muted-foreground", isCollapsed && "hidden")}>
            Chưa có chức năng nghiệp vụ được cấp quyền.
          </p>
        ) : null}
      </nav>

      <Separator />
      <div className={cn("flex flex-col gap-1 p-5 text-xs text-muted-foreground", isCollapsed && "hidden")}>
        <p className="font-medium text-foreground">Phạm vi bảo mật</p>
        <p className="leading-5">Dữ liệu hiển thị theo quyền truy cập được cấp.</p>
      </div>
    </aside>
  );
}

type NavigationLinkProps = {
  item: NavigationLinkItem;
  onNavigate?: () => void;
  isNested?: boolean;
  isCollapsed?: boolean;
};

function NavigationLink({ item, onNavigate, isNested, isCollapsed }: NavigationLinkProps) {
  const Icon = item.icon;
  const location = useLocation();
  const isActive = isLinkActive(location.pathname, location.search, item.href);

  return (
    <NavLink
      to={item.href}
      onClick={onNavigate}
      title={isCollapsed ? item.label : undefined}
      aria-label={isCollapsed ? item.label : undefined}
      className={cn(
        "mb-1 flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        isNested && "ml-4 min-h-10 border-l border-border pl-4 text-xs",
        isCollapsed && "justify-center px-0",
        isActive
          ? "bg-accent text-accent-foreground shadow-xs"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon aria-hidden="true" />
      <span className={cn(isCollapsed && "sr-only")}>{item.label}</span>
    </NavLink>
  );
}

type NavigationGroupProps = {
  item: NavigationGroupItem;
  onNavigate?: () => void;
  isCollapsed?: boolean;
  onExpand?: () => void;
};

function NavigationGroup({ item, onNavigate, isCollapsed, onExpand }: NavigationGroupProps) {
  const location = useLocation();
  const contentId = useId();
  const isActive = item.children.some((child) => isPathActive(location.pathname, child.href));
  const [isManuallyOpen, setIsManuallyOpen] = useState(false);
  const isOpen = isActive || isManuallyOpen;
  const Icon = item.icon;

  return (
    <div className="mb-1">
      <button
        type="button"
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
          isCollapsed && "justify-center px-0",
          isActive
            ? "bg-accent text-accent-foreground shadow-xs"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
        aria-expanded={isCollapsed ? false : isOpen}
        aria-controls={contentId}
        aria-label={isCollapsed ? `Mở nhóm ${item.label}` : undefined}
        title={isCollapsed ? item.label : undefined}
        onClick={() => {
          if (isCollapsed) {
            setIsManuallyOpen(true);
            onExpand?.();
            return;
          }
          setIsManuallyOpen((open) => !open);
        }}
      >
        <Icon aria-hidden="true" />
        <span className={cn("min-w-0 flex-1 truncate", isCollapsed && "sr-only")}>{item.label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 transition-transform", isCollapsed && "hidden", isOpen && "rotate-180")}
        />
      </button>

      {!isCollapsed && isOpen && (
        <div id={contentId} className="mt-1">
          {item.children.map((child) => (
            <NavigationLink key={child.href} item={child} onNavigate={onNavigate} isNested />
          ))}
        </div>
      )}
    </div>
  );
}

function isPathActive(pathname: string, href: string) {
  const hrefPath = href.split("?")[0];
  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

function isLinkActive(pathname: string, search: string, href: string) {
  const [hrefPath, hrefSearch] = href.split("?");
  if (hrefSearch) return pathname === hrefPath && search === `?${hrefSearch}`;
  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}
