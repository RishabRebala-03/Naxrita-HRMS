export const ASSIGNABLE_ADMIN_MENUS = [
  "leaves",
  "employees",
  "add",
  "holidays",
  "apply-behalf",
  "projects",
  "tea-coffee",
  "timesheets",
  "payslips",
  "mail",
  "logs",
];

const SHARED_ROLE_ACCESS = {
  dashboard: ["Admin", "Manager", "Employee"],
  employees: ["Admin", "Manager"],
  leaves: ["Admin", "Manager", "Employee"],
  "tea-coffee": ["Admin", "Manager", "Employee"],
  timesheets: ["Admin", "Manager", "Employee"],
  payslips: ["Admin", "Manager", "Employee"],
  policy: ["Admin", "Manager", "Employee"],
  calendar: ["Admin", "Manager", "Employee"],
  profile: ["Admin", "Manager", "Employee"],
  progress: ["Admin", "Manager", "Employee"],
  holidays: ["Admin"],
  "apply-behalf": ["Admin"],
  logs: ["Admin"],
  mail: ["Admin"],
  add: ["Admin"],
  projects: ["Admin"],
  "access-management": ["Admin"],
};

export const normalizeAdminMenuAccess = (values) => {
  const unique = new Set();
  return (values || []).filter((value) => {
    const key = String(value || "").trim();
    if (!ASSIGNABLE_ADMIN_MENUS.includes(key) || unique.has(key)) {
      return false;
    }
    unique.add(key);
    return true;
  });
};

export const isFullAdmin = (user) => String(user?.role || "").trim() === "Admin";

export const hasAdminMenuAccess = (user, key) => {
  if (isFullAdmin(user)) return true;
  if (key === "access-management") return false;
  return normalizeAdminMenuAccess(user?.adminMenuAccess).includes(key);
};

export const canAccessSection = (user, sectionKey) => {
  const allowedRoles = SHARED_ROLE_ACCESS[sectionKey] || [];
  if (allowedRoles.includes(user?.role || "Employee")) {
    return true;
  }
  return hasAdminMenuAccess(user, sectionKey);
};
