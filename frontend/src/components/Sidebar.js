import React from "react";
import {
  Briefcase,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Coffee,
  Clock3,
  FileBadge2,
  FileText,
  FolderKanban,
  Home,
  NotebookPen,
  ScrollText,
  UserCog,
  Users,
} from "lucide-react";
import logo from "../assets/naxicon.png";

const buttons = [
  { key: "dashboard", label: "Overview", roles: ["Admin", "Manager", "Employee"], icon: Home },
  { key: "employees", label: "Employees", roles: ["Admin", "Manager"], icon: Users },
  { key: "leaves", label: "Leave Management", roles: ["Admin", "Manager", "Employee"], icon: ClipboardList },
  { key: "tea-coffee", label: "Tea and Coffee", roles: ["Admin", "Manager", "Employee"], icon: Coffee },
  { key: "timesheets", label: "MyTimeAndExpenses", roles: ["Admin", "Manager", "Employee"], icon: Clock3 },
  { key: "payslips", label: "Payslips", roles: ["Admin", "Manager", "Employee"], icon: FileBadge2 },
  { key: "policy", label: "Policies", roles: ["Admin", "Manager", "Employee"], icon: FileText },
  { key: "projects", label: "Projects", roles: ["Admin"], icon: FolderKanban },
  { key: "apply-behalf", label: "Apply on Behalf", roles: ["Admin"], icon: NotebookPen },
  { key: "logs", label: "Audit Logs", roles: ["Admin"], icon: ScrollText },
  { key: "add", label: "Employee Setup", roles: ["Admin"], icon: UserCog },
  { key: "holidays", label: "Holiday Calendar", roles: ["Admin"], icon: Briefcase },
  { key: "calendar", label: "Calendar", roles: ["Admin", "Manager", "Employee"], icon: CalendarDays },
];

const Sidebar = ({ section, setSection, role, restricted = [], isOpen, isCollapsed, onToggleCollapse }) => {
  const visibleButtons = buttons.filter(
    (btn) => !restricted.includes(btn.key) && (!role || btn.roles.includes(role))
  );

  return (
    <aside className={`sidebar ${isOpen ? "open" : ""} ${isCollapsed ? "collapsed" : ""}`}>
      <div className="brand">
        <img className="brand-mark" src={logo} alt="Naxrita" />
        <div className="brand-copy">
          <strong>
            <span>Naxrita</span>
          </strong>
        </div>
      </div>

      <nav className="nav">
        {visibleButtons.map((btn) => {
          const Icon = btn.icon;
          const isActive = section === btn.key;

          return (
            <button
              key={btn.key}
              className={isActive ? "active" : ""}
              onClick={() => setSection(btn.key)}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={17} strokeWidth={1.9} />
              <span>{btn.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="footer">
        <button
          type="button"
          className="sidebar-collapse-btn desktop-only sidebar-collapse-btn-bottom"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
