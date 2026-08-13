import {
  BarChart3,
  BadgeDollarSign,
  Bell,
  BriefcaseBusiness,
  Building2,
  ClipboardCheck,
  ClipboardList,
  ContactRound,
  FileText,
  GraduationCap,
  History,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  ListPlus,
  ListChecks,
  Megaphone,
  ScrollText,
  Settings,
  ShieldCheck,
  KeyRound,
  Tags,
  UserPlus,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type NavigationLinkItem = {
  type?: "link";
  label: string;
  href: string;
  icon: LucideIcon;
  permissions?: string[];
};

export type NavigationGroupItem = {
  type: "group";
  label: string;
  icon: LucideIcon;
  permissions?: string[];
  children: NavigationLinkItem[];
};

export type NavigationItem = NavigationLinkItem | NavigationGroupItem;

export type NavigationSection = {
  id: string;
  label: string;
  href: string;
  items: NavigationItem[];
};

const navigationSections: NavigationSection[] = [
  {
    id: "overview",
    label: "Tổng quan",
    href: "/tong-quan",
    items: [
      {
        label: "Tổng quan",
        href: "/tong-quan",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    id: "sale",
    label: "CRM Sale",
    href: "/sale/leads",
    items: [
      {
        type: "group",
        label: "Lead",
        icon: ContactRound,
        children: [
          {
            label: "Danh sách lead",
            href: "/sale/leads",
            icon: ContactRound,
            permissions: ["lead.view_all", "lead.view_department", "lead.view_assigned"],
          },
          {
            label: "Phân công lead",
            href: "/sale/phan-cong",
            icon: UserPlus,
            permissions: ["lead.view_all"],
          },
        ],
      },
      {
        type: "group",
        label: "CRM Sale",
        icon: BriefcaseBusiness,
        children: [
          {
            label: "Hoạt động sale",
            href: "/sale/hoat-dong",
            icon: ListChecks,
            permissions: ["lead.view_all", "lead_activity.view_department", "lead_activity.create"],
          },
          {
            label: "Nhắc việc sale",
            href: "/sale/nhac-viec",
            icon: Bell,
            permissions: ["lead.view_all", "reminder.create", "reminder.update", "reminder.complete"],
          },
          {
            label: "KPI sale",
            href: "/sale/kpi",
            icon: BarChart3,
            permissions: ["lead.view_all"],
          },
        ],
      },
      {
        type: "group",
        label: "Cấu hình trường dữ liệu",
        icon: ListPlus,
        permissions: ["custom_field.view"],
        children: [
          {
            label: "Form lead",
            href: "/sale/cau-hinh-truong?form=lead",
            icon: ContactRound,
            permissions: ["custom_field.view"],
          },
          {
            label: "Form hoạt động",
            href: "/sale/cau-hinh-truong?form=activity",
            icon: ListChecks,
            permissions: ["custom_field.view"],
          },
          {
            label: "Form nhắc việc",
            href: "/sale/cau-hinh-truong?form=reminder",
            icon: Bell,
            permissions: ["custom_field.view"],
          },
        ],
      },
    ],
  },
  {
    id: "marketing",
    label: "CRM Marketing",
    href: "/marketing/chien-dich",
    items: [
      {
        label: "Chiến dịch Marketing",
        href: "/marketing/chien-dich",
        icon: Megaphone,
        permissions: ["campaign.view_all", "campaign.view", "campaign.view_own"],
      },
      {
        label: "Nguồn lead",
        href: "/marketing/nguon-lead",
        icon: Tags,
        permissions: ["campaign.view_all", "lead_source.manage"],
      },
      {
        label: "Theo dõi UTM",
        href: "/marketing/utm",
        icon: Link2,
        permissions: ["campaign.view_all", "utm.view", "utm.view_own"],
      },
      {
        label: "Form & Survey",
        href: "/marketing/form-survey",
        icon: Workflow,
        permissions: ["campaign.view_all", "marketing_form.manage", "marketing_form.create", "marketing_form.update_own"],
      },
      {
        type: "group",
        label: "Cấu hình trường dữ liệu",
        icon: ListPlus,
        permissions: ["custom_field.view"],
        children: [
          { label: "Form chiến dịch", href: "/marketing/cau-hinh-truong?form=campaign", icon: Megaphone, permissions: ["custom_field.view"] },
          { label: "Form & Survey", href: "/marketing/cau-hinh-truong?form=survey", icon: Workflow, permissions: ["custom_field.view"] },
        ],
      },
    ],
  },
  {
    id: "admission",
    label: "CRM Tuyển sinh",
    href: "/tuyen-sinh/ho-so",
    items: [
      {
        label: "Hồ sơ tuyển sinh",
        href: "/tuyen-sinh/ho-so",
        icon: ClipboardList,
        permissions: ["admission.view_all", "admission.view"],
      },
      {
        label: "Tài liệu hồ sơ",
        href: "/tuyen-sinh/tai-lieu-ho-so",
        icon: FileText,
        permissions: ["admission.view_all", "admission.view", "admission_document.view"],
      },
      {
        label: "Trạng thái hồ sơ",
        href: "/tuyen-sinh/trang-thai-ho-so",
        icon: ClipboardCheck,
        permissions: ["admission.view_all", "admission.view"],
      },
      {
        label: "Quản lý ngành",
        href: "/tuyen-sinh/nganh",
        icon: GraduationCap,
        permissions: ["admission_major.manage"],
      },
      {
        label: "Phí / học phí",
        href: "/tuyen-sinh/phi-hoc-phi",
        icon: BadgeDollarSign,
        permissions: ["admission.view_all", "admission.view"],
      },
      {
        type: "group",
        label: "Cấu hình trường dữ liệu",
        icon: ListPlus,
        permissions: ["custom_field.view"],
        children: [
          { label: "Form hồ sơ", href: "/tuyen-sinh/cau-hinh-truong?form=profile", icon: ClipboardList, permissions: ["custom_field.view"] },
          { label: "Form tài liệu", href: "/tuyen-sinh/cau-hinh-truong?form=document", icon: FileText, permissions: ["custom_field.view"] },
          { label: "Form trạng thái", href: "/tuyen-sinh/cau-hinh-truong?form=status", icon: ClipboardCheck, permissions: ["custom_field.view"] },
          { label: "Form ngành", href: "/tuyen-sinh/cau-hinh-truong?form=major", icon: GraduationCap, permissions: ["custom_field.view"] },
        ],
      },
    ],
  },
  {
    id: "student",
    label: "CRM Sinh viên",
    href: "/sinh-vien/danh-sach",
    items: [
      {
        label: "Danh sách sinh viên",
        href: "/sinh-vien/danh-sach",
        icon: GraduationCap,
        permissions: ["student.view_all", "student.view"],
      },
      {
        label: "Dịch vụ sinh viên",
        href: "/sinh-vien/dich-vu",
        icon: LifeBuoy,
        permissions: ["student.view_all", "student_service.view", "student_service.create", "student_service.update"],
      },
      {
        label: "Lịch sử hỗ trợ",
        href: "/sinh-vien/lich-su-ho-tro",
        icon: History,
        permissions: ["student.view_all", "student_service.view"],
      },
    ],
  },
  {
    id: "report",
    label: "Báo cáo",
    href: "/bao-cao/tong-hop",
    items: [
      {
        label: "Báo cáo tổng hợp",
        href: "/bao-cao/tong-hop",
        icon: BarChart3,
        permissions: ["report.view_all"],
      },
      {
        label: "Marketing chi tiết",
        href: "/bao-cao/marketing",
        icon: Megaphone,
        permissions: ["report.view_all"],
      },
      {
        label: "Sale chi tiết",
        href: "/bao-cao/sale",
        icon: BriefcaseBusiness,
        permissions: ["report.view_all"],
      },
      {
        label: "Tuyển sinh chi tiết",
        href: "/bao-cao/tuyen-sinh",
        icon: ClipboardList,
        permissions: ["report.view_all"],
      },
      {
        label: "Sinh viên chi tiết",
        href: "/bao-cao/sinh-vien",
        icon: GraduationCap,
        permissions: ["report.view_all"],
      },
    ],
  },
  {
    id: "management",
    label: "Quản lý",
    href: "/quan-ly/nguoi-dung",
    items: [
      {
        label: "Quản lý người dùng",
        href: "/quan-ly/nguoi-dung",
        icon: UsersRound,
        permissions: ["user.manage"],
      },
      {
        label: "Vai trò & scope",
        href: "/quan-ly/vai-tro",
        icon: ShieldCheck,
        permissions: ["role.manage"],
      },
      {
        label: "Quyền hạn",
        href: "/quan-ly/quyen-han",
        icon: KeyRound,
        permissions: ["permission.manage"],
      },
      {
        label: "Phòng ban",
        href: "/quan-ly/phong-ban",
        icon: Building2,
        permissions: ["department.manage"],
      },
      {
        label: "Pipeline",
        href: "/quan-ly/pipeline",
        icon: Workflow,
        permissions: ["pipeline.manage"],
      },
      {
        label: "Rule Automation",
        href: "/automations",
        icon: Workflow,
        permissions: ["automation.manage"],
      },
      {
        label: "Cấu hình hệ thống",
        href: "/quan-ly/cau-hinh",
        icon: Settings,
        permissions: ["system.manage"],
      },
      {
        label: "Chương trình tuyển sinh",
        href: "/quan-ly/chuong-trinh",
        icon: GraduationCap,
        permissions: ["institution_program.manage"],
      },
      {
        label: "Nhật ký hệ thống",
        href: "/he-thong/nhat-ky",
        icon: ScrollText,
        permissions: ["audit.view"],
      },
    ],
  },
];

export function isNavigationGroup(item: NavigationItem): item is NavigationGroupItem {
  return item.type === "group";
}

export function isNavigationLink(item: NavigationItem): item is NavigationLinkItem {
  return !isNavigationGroup(item);
}

export function getNavigationSections(permissions: string[]) {
  const grantedPermissions = new Set(permissions);
  return navigationSections.reduce<NavigationSection[]>((visibleSections, section) => {
    const items = filterNavigationItems(section.items, grantedPermissions);
    if (items.length > 0) {
      visibleSections.push({ ...section, href: getDefaultSectionHref({ ...section, items }), items });
    }
    return visibleSections;
  }, []);
}

export function getNavigationItems(permissions: string[]) {
  return getNavigationSections(permissions).flatMap((section) => section.items);
}

export function getActiveNavigationSection(pathname: string, sections: NavigationSection[]) {
  return sections.find((section) => section.items.some((item) => isNavigationItemActive(pathname, item))) ?? sections[0];
}

export function getDefaultSectionHref(section: NavigationSection) {
  return getFirstNavigationHref(section.items) ?? section.href;
}

function filterNavigationItems(items: NavigationItem[], grantedPermissions: Set<string>) {
  const hasPermission = (item: { permissions?: string[] }) =>
    !item.permissions ||
    item.permissions.some((permission) => grantedPermissions.has(permission));

  return items.reduce<NavigationItem[]>((visibleItems, item) => {
    if (isNavigationGroup(item)) {
      const children = item.children.filter(hasPermission);

      if (children.length > 0 && hasPermission(item)) {
        visibleItems.push({ ...item, children });
      }

      return visibleItems;
    }

    if (hasPermission(item)) {
      visibleItems.push(item);
    }

    return visibleItems;
  }, []);
}

function getFirstNavigationHref(items: NavigationItem[]): string | null {
  for (const item of items) {
    if (isNavigationLink(item)) return item.href;
    const childHref = getFirstNavigationHref(item.children);
    if (childHref) return childHref;
  }
  return null;
}

function isNavigationItemActive(pathname: string, item: NavigationItem): boolean {
  if (isNavigationLink(item)) {
    const hrefPath = item.href.split("?")[0];
    return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
  }
  return item.children.some((child) => isNavigationItemActive(pathname, child));
}
