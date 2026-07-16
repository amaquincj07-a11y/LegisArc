import type { UserRole } from "./types";

export const DOCUMENT_TYPES = [
  { value: "ordinance", label: "Ordinance" },
  { value: "resolution", label: "Resolution" },
  { value: "minutes", label: "Minutes" },
] as const;

export const DOCUMENT_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
] as const;

export const SESSION_TYPES = [
  { value: "regular", label: "Regular" },
  { value: "special", label: "Special" },
] as const;

/** Earliest series year offered in ordinance/resolution Year dropdowns. */
export const SERIES_YEAR_MIN = 1980;

/**
 * Series years from the present calendar year down to {@link SERIES_YEAR_MIN}.
 * Extends automatically each new year (e.g. includes 2027 when the clock reaches 2027).
 */
export function getSeriesYearOptions(
  referenceYear: number = new Date().getFullYear()
): number[] {
  const end = Math.max(referenceYear, SERIES_YEAR_MIN);
  const years: number[] = [];
  for (let year = end; year >= SERIES_YEAR_MIN; year -= 1) {
    years.push(year);
  }
  return years;
}

export const COMMITTEE_YEAR_TERMS = [
  "2025-2028",
  "2023-2025",
  "2019-2022",
] as const;

export const CSO_YEAR_TERMS = [
  "2025-2028",
  "2023-2025",
  "2022-2025",
  "2019-2022",
  "2016-2019",
  "2013-2016",
  "2010-2013",
] as const;

/** Standard SB roster slots per term (12 positions). */
export const SB_MEMBER_POSITION_SLOTS = [
  {
    slot: "vice_mayor",
    label: "Vice Mayor",
    cardPosition: "Vice Mayor",
    order: 0,
  },
  {
    slot: "kagawad_1",
    label: "Kagawad 1",
    cardPosition: "SB Member",
    order: 1,
  },
  {
    slot: "kagawad_2",
    label: "Kagawad 2",
    cardPosition: "SB Member",
    order: 2,
  },
  {
    slot: "kagawad_3",
    label: "Kagawad 3",
    cardPosition: "SB Member",
    order: 3,
  },
  {
    slot: "kagawad_4",
    label: "Kagawad 4",
    cardPosition: "SB Member",
    order: 4,
  },
  {
    slot: "kagawad_5",
    label: "Kagawad 5",
    cardPosition: "SB Member",
    order: 5,
  },
  {
    slot: "kagawad_6",
    label: "Kagawad 6",
    cardPosition: "SB Member",
    order: 6,
  },
  {
    slot: "kagawad_7",
    label: "Kagawad 7",
    cardPosition: "SB Member",
    order: 7,
  },
  {
    slot: "kagawad_8",
    label: "Kagawad 8",
    cardPosition: "SB Member",
    order: 8,
  },
  {
    slot: "abc_president",
    label: "ABC President",
    cardPosition: "ABC President",
    order: 9,
  },
  {
    slot: "sk_federated",
    label: "SK Federated President",
    cardPosition: "SK Federation President",
    order: 10,
  },
  {
    slot: "sb_secretary",
    label: "SB Secretary",
    cardPosition: "SB Secretary",
    order: 11,
  },
] as const;

export const REQUEST_STATUSES = [
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "released", label: "Released" },
  { value: "denied", label: "Denied" },
] as const;

export const DEFAULT_CATEGORIES = [
  "Environment",
  "Infrastructure",
  "Taxes",
  "Fees and Charges",
  "Penal, Criminal and Regulatory",
  "Agriculture",
  "Education",
  "Health",
  "Peace and Order",
  "Sports / Amusement",
  "Tourism",
  "Monetary Aide and other requests",
  "Land Use / Zoning",
  "Municipal Lots",
  "Waterworks",
  "Administrative Matters",
  "History and Heritage",
  "Budget",
  "Loans and other Fiscal Matters",
  "Celebrations",
  "Sisterhood Agreement",
  "Women and Children / PWD / Senior Citizen",
  "Information Technology",
  "MOA / MOU / Usufruct / Contracts & Agreements",
  "Coastal Management",
  "Traffic Matters",
  "NGO / PO Accreditation",
  "Purok System",
  "Risk Reduction",
  "Transportation",
  "Franchise",
] as const;

/** Budget-category ordinances may be labeled Appropriation Ordinance instead of Municipal. */
export const APPROPRIATION_ORDINANCE_CATEGORY = "Budget";

/** Module access granted to all LGU staff (primary admin and created users). */
export const LGU_STAFF_MODULE_ACCESS = [
  "ordinances",
  "resolutions",
  "minutes",
  "categories",
] as const;

export const USER_ROLES: { value: UserRole; label: string }[] = [
  { value: "sys_admin", label: "System Administrator" },
  { value: "sb_secretary", label: "SB Secretary" },
  { value: "sb_member", label: "SB Member" },
  { value: "digitization_assistant", label: "Digitization Assistant" },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  sys_admin: "System Administrator",
  sb_secretary: "SB Secretary",
  sb_member: "SB Member",
  digitization_assistant: "Digitization Assistant",
};

export type NavItem = {
  title: string;
  href: string;
  icon: string;
  roles: UserRole[];
  primaryAdminOnly?: boolean;
  badge?: string;
};

export const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    title: "Dashboard",
    href: "/admin/dashboard",
    icon: "LayoutDashboard",
    roles: ["sys_admin", "sb_secretary", "sb_member", "digitization_assistant"],
  },
  {
    title: "Ordinances",
    href: "/admin/ordinances",
    icon: "ScrollText",
    roles: ["sb_secretary", "sb_member", "digitization_assistant"],
  },
  {
    title: "Resolutions",
    href: "/admin/resolutions",
    icon: "FileText",
    roles: ["sb_secretary", "sb_member", "digitization_assistant"],
  },
  {
    title: "Minutes",
    href: "/admin/minutes",
    icon: "BookOpen",
    roles: ["sb_secretary"],
  },
  {
    title: "SB Members",
    href: "/admin/sb-members",
    icon: "UserCircle",
    roles: ["sys_admin", "sb_secretary"],
  },
  {
    title: "CSO",
    href: "/admin/cso",
    icon: "Handshake",
    roles: ["sys_admin", "sb_secretary"],
  },
  {
    title: "Categories",
    href: "/admin/categories",
    icon: "Tags",
    roles: ["sys_admin", "sb_secretary"],
  },
  {
    title: "Users",
    href: "/admin/users",
    icon: "Users",
    roles: ["sys_admin", "sb_secretary"],
    primaryAdminOnly: true,
  },
  {
    title: "Recent Activity",
    href: "/admin/recent-activity",
    icon: "Shield",
    roles: ["sys_admin", "sb_secretary"],
  },
  {
    title: "Document Requests",
    href: "/admin/requests",
    icon: "ClipboardList",
    roles: ["sys_admin", "sb_secretary", "sb_member", "digitization_assistant"],
  },
  {
    title: "Billing",
    href: "/admin/billing",
    icon: "CreditCard",
    roles: ["sys_admin", "sb_secretary"],
  },
  {
    title: "Settings",
    href: "/admin/settings",
    icon: "Settings",
    roles: ["sys_admin"],
  },
];

export const PUBLIC_HOME_PATH = "/home";
export const PUBLIC_SBCHART_PATH = "/sbchart";

export const PUBLIC_NAV_ITEMS = [
  { title: "Home", href: PUBLIC_HOME_PATH },
  { title: "SB Chart", href: PUBLIC_SBCHART_PATH },
  { title: "Ordinances", href: "/ordinances" },
  { title: "Resolutions", href: "/resolutions" },
  { title: "Minutes", href: "/minutes" },
  { title: "CSO", href: "/cso" },
];

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
export const ACCEPTED_FILE_TYPES = ["application/pdf"];
export const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50];
