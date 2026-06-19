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
  Mail,
  NotebookPen,
  ScrollText,
  Shield,
  UserCog,
  Users,
} from "lucide-react";
import logo from "../assets/naxicon.png";
import { canAccessSection } from "../utils/accessControl";

const buttons = [
  { key: "dashboard", label: "Overview", icon: Home },
  { key: "employees", label: "Employees", icon: Users },
  { key: "leaves", label: "Leave Management", icon: ClipboardList },
  { key: "tea-coffee", label: "Tea and Coffee", icon: Coffee },
  { key: "timesheets", label: "MyTimeAndExpenses", icon: Clock3 },
  { key: "payslips", label: "Payslips", icon: FileBadge2 },
  { key: "policy", label: "Policies", icon: FileText },
  { key: "projects", label: "Projects", icon: FolderKanban },
  { key: "apply-behalf", label: "Apply on Behalf", icon: NotebookPen },
  { key: "mail", label: "Mail Admin", icon: Mail },
  { key: "logs", label: "Audit Logs", icon: ScrollText },
  { key: "add", label: "Employee Setup", icon: UserCog },
  { key: "holidays", label: "Holiday Calendar", icon: Briefcase },
  { key: "access-management", label: "Access Management", icon: Shield },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
];

const Sidebar = ({ section, setSection, currentUser, restricted = [], isOpen, isCollapsed, onToggleCollapse }) => {
  const visibleButtons = buttons.filter(
    (btn) => !restricted.includes(btn.key) && canAccessSection(currentUser, btn.key)
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
