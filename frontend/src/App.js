// src/App.js
import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import Login from "./components/Login";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import UserForm from "./components/UserForm";
import UserList from "./components/UserList";
import ManagerInfo from "./components/ManagerInfo";
import Profile from "./components/Profile";
import Calendar from "./components/Calendar";
import AdminDashboard from "./components/Dashboard";
import EmployeeDashboard from "./components/EmployeeDashboard";
import ManagerDashboard from "./components/ManagerDashboard";
import EmployeeList from "./components/EmployeeList";
import EmployeeLeaves from "./components/EmployeeLeaves";
import ManagerLeaves from "./components/ManagerLeaves";
import ProgressTracker from "./components/ProgressTracker";
import AdminLeaves from "./components/AdminLeaves";
import AdminHolidays from "./components/AdminHolidays";
import AdminApplyLeave from "./components/AdminApplyLeave";
import AdminLogs from "./components/AdminLogs";
import TeaCoffee from "./components/TeaCoffee";
import Policy from "./components/Policy";
import Projects from "./components/Projects";
import Timesheets from "./components/Timesheets";
import Payslips from "./components/Payslips";
import MailAdmin from "./components/MailAdmin";
import EnterpriseAssistant from "./components/EnterpriseAssistant";
import AccessManagement from "./components/AccessManagement";
import { canAccessSection, hasAdminMenuAccess } from "./utils/accessControl";

// Injects critical CSS to fix mobile scrolling
const MobileScrollFix = () => (
  <style>{`
    @media (max-width: 480px) {
      html, body, #root {
        overflow-x: hidden !important;
        overflow-y: auto !important;
        height: auto !important;
        min-height: 100vh;
      }
      .app-root {
        height: auto !important;
        min-height: 100vh;
      }
      .main {
        height: auto !important;
        min-height: 100vh;
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch;
      }
      .content {
        overflow: visible !important;
        height: auto !important;
        padding-bottom: 60px !important;
      }
      @supports (-webkit-touch-callout: none) {
        .content {
          padding-bottom: 100px !important;
        }
      }
    }
  `}</style>
);

// Forces scroll fix on mount for mobile
const ForceScroll = () => {
  useEffect(() => {
    if (window.innerWidth <= 480) {
      console.log('🔧 MOBILE DETECTED - Forcing scroll fix...');

      document.documentElement.style.setProperty('overflow-y', 'scroll', 'important');
      document.documentElement.style.setProperty('height', 'auto', 'important');
      document.documentElement.style.setProperty('min-height', '100vh', 'important');

      document.body.style.setProperty('overflow-y', 'scroll', 'important');
      document.body.style.setProperty('height', 'auto', 'important');
      document.body.style.setProperty('min-height', '100vh', 'important');

      const root = document.getElementById('root');
      if (root) {
        root.style.setProperty('overflow-y', 'visible', 'important');
        root.style.setProperty('height', 'auto', 'important');
        root.style.setProperty('min-height', '100vh', 'important');
      }

      const main = document.querySelector('.main');
      if (main) {
        main.style.setProperty('overflow-y', 'scroll', 'important');
        main.style.setProperty('height', 'auto', 'important');
        main.style.setProperty('min-height', '100vh', 'important');
        main.style.setProperty('-webkit-overflow-scrolling', 'touch', 'important');
      }

      const content = document.querySelector('.content');
      if (content) {
        content.style.setProperty('overflow', 'visible', 'important');
        content.style.setProperty('height', 'auto', 'important');
        content.style.setProperty('padding-bottom', '100px', 'important');
      }

      console.log('✅ Scroll fix applied!');
      console.log('Body scrollHeight:', document.body.scrollHeight);
      console.log('Window innerHeight:', window.innerHeight);
      console.log('Can scroll:', document.body.scrollHeight > window.innerHeight);
    }
  }, []);

  return null;
};

const DelegatedLeavesWorkspace = ({ user, baseRole, navigationState }) => {
  const [activeTab, setActiveTab] = useState("personal");

  const personalLabel = baseRole === "Manager" ? "Manager Leave" : "My Leave";

  return (
    <section className="delegated-leaves-workspace">
      <nav
        className="page-subtab-strip delegated-leaves-tab-strip"
        role="tablist"
        aria-label="Delegated leave workspace tabs"
      >
        <button
          type="button"
          className={`page-subtab-button delegated-leaves-tab-button ${activeTab === "personal" ? "is-active" : ""}`}
          onClick={() => setActiveTab("personal")}
          role="tab"
          aria-selected={activeTab === "personal"}
        >
          {personalLabel}
        </button>
        <button
          type="button"
          className={`page-subtab-button delegated-leaves-tab-button ${activeTab === "admin" ? "is-active" : ""}`}
          onClick={() => setActiveTab("admin")}
          role="tab"
          aria-selected={activeTab === "admin"}
        >
          Admin Leaves
        </button>
      </nav>

      {activeTab === "personal"
        ? baseRole === "Manager"
          ? <ManagerLeaves user={user} />
          : <EmployeeLeaves user={user} navigationState={navigationState} />
        : <AdminLeaves user={user} />}
    </section>
  );
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [section, setSection] = useState("dashboard");
  const [sectionState, setSectionState] = useState(null);
  const [viewEmployeeId, setViewEmployeeId] = useState(null);
  const [profileReturnSection, setProfileReturnSection] = useState("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Session recovery on app load
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser && !currentUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        console.log('✅ Session recovered:', parsedUser.name);
        setCurrentUser(parsedUser);
        setIsAuthenticated(true);
      } catch (err) {
        console.error('❌ Failed to recover session:', err);
        localStorage.removeItem('user');
      }
    }
  }, []);

  // Save session whenever user changes
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('user', JSON.stringify(currentUser));
      console.log('💾 Session updated in localStorage');
    }
  }, [currentUser]);

  // Debug logger to track user state changes
  useEffect(() => {
    console.log('🔍 User state changed:', currentUser ? `Logged in as ${currentUser.name}` : 'Logged out');
  }, [currentUser]);

  const [portalAlerts, setPortalAlerts] = useState([]);
  const alertTimeoutsRef = useRef(new Map());

  useEffect(() => {
    const alertTimeouts = alertTimeoutsRef.current;
    const dismissAlert = (id) => {
      const timeoutId = alertTimeouts.get(id);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        alertTimeouts.delete(id);
      }
      setPortalAlerts((previous) => previous.filter((alertItem) => alertItem.id !== id));
    };

    const originalAlert = window.alert;

    window.alert = (message) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const text = typeof message === "string" ? message : String(message ?? "");
      setPortalAlerts((previous) => [...previous, { id, text }]);

      const timeoutId = window.setTimeout(() => {
        dismissAlert(id);
      }, 4000);

      alertTimeouts.set(id, timeoutId);
    };

    return () => {
      window.alert = originalAlert;
      alertTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
      alertTimeouts.clear();
    };
  }, []);

  const dismissPortalAlert = (id) => {
    const timeoutId = alertTimeoutsRef.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      alertTimeoutsRef.current.delete(id);
    }
    setPortalAlerts((previous) => previous.filter((alertItem) => alertItem.id !== id));
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    setSection("dashboard");
    setSectionState(null);
  };

  const handleUserUpdate = (updatedUser) => {
    setCurrentUser(updatedUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    console.log('👋 User logged out, session cleared');
    setCurrentUser(null);
    setIsAuthenticated(false);
    setSection("dashboard");
    setSectionState(null);
    setViewEmployeeId(null);
    setProfileReturnSection("dashboard");
  };

  const handleNavigateToProfile = (employeeId) => {
    console.log("🔍 Navigation requested with:", employeeId);
    console.log("   Type:", typeof employeeId);

    let targetId = employeeId;

    if (!employeeId) {
      console.error("❌ No employee ID provided");
      alert("Error: No employee ID provided");
      return;
    }

    if (typeof employeeId === "object" && employeeId !== null) {
      console.warn("⚠️ Object passed to navigation, extracting ID...");
      console.log("   Object keys:", Object.keys(employeeId));
      console.log("   Full object:", JSON.stringify(employeeId, null, 2));

      targetId = employeeId._id ||
                 employeeId.id ||
                 employeeId.employeeId ||
                 null;

      if (targetId) {
        console.log("✅ Extracted ID from object:", targetId);
      } else {
        console.error("❌ Could not extract ID from object");
        alert("Error: Invalid employee ID (object without _id property)");
        return;
      }
    }

    if (typeof targetId !== "string") {
      console.error("❌ targetId is not a string:", targetId, "Type:", typeof targetId);
      alert("Error: Invalid employee ID format (not a string)");
      return;
    }

    if (targetId === "[object Object]" || targetId.includes("[object")) {
      console.error("❌ targetId is a stringified object:", targetId);
      alert("Error: Invalid employee ID (stringified object)");
      return;
    }

    if (!/^[a-f0-9]{24}$/i.test(targetId)) {
      console.error("❌ Invalid MongoDB ObjectId format:", targetId);
      alert(`Error: Invalid employee ID format. Expected 24 hex characters, got: ${targetId}`);
      return;
    }

    console.log("✅ All validations passed, navigating to profile:", targetId);
    setProfileReturnSection(section);
    setViewEmployeeId(targetId);
    setSection("profile");
  };

  const handleSectionChange = (newSection, nextSectionState = null) => {
    if (
      newSection === "profile" ||
      newSection === "leaves" ||
      newSection === "employees" ||
      newSection === "progress"
    ) {
      setViewEmployeeId(null);
    }
    if (newSection !== "profile") {
      setProfileReturnSection(newSection);
    }
    setSectionState(nextSectionState);
    setSection(newSection);
  };

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const role = currentUser?.role || "Employee";

  const getFilteredSidebar = () => {
    switch (role) {
      case "Admin":
        return (
          <Sidebar
            section={section}
            setSection={(s) => {
              handleSectionChange(s);
              setIsSidebarOpen(false);
            }}
            currentUser={currentUser}
            isOpen={isSidebarOpen}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          />
        );

      case "Manager":
        return (
          <Sidebar
            section={section}
            setSection={(s) => {
              handleSectionChange(s);
              setIsSidebarOpen(false);
            }}
            currentUser={currentUser}
            isOpen={isSidebarOpen}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          />
        );

      case "Employee":
      default:
        return (
          <Sidebar
            section={section}
            setSection={(s) => {
              handleSectionChange(s);
              setIsSidebarOpen(false);
            }}
            currentUser={currentUser}
            isOpen={isSidebarOpen}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          />
        );
    }
  };

  const AccessDenied = () => (
    <div style={{ padding: 40, color: "#ef4444" }}>
      <h2>Access Denied</h2>
      <p>You do not have permission to access this section.</p>
    </div>
  );

  const renderSection = () => {
    switch (section) {
      case "dashboard":
        if (role === "Admin") {
          return <AdminDashboard user={currentUser} onNavigate={handleSectionChange} />;
        } else if (role === "Manager") {
          return (
            <ManagerDashboard
              user={currentUser}
              onNavigate={handleSectionChange}
              onNavigateToProfile={handleNavigateToProfile}
            />
          );
        } else {
          return (
            <EmployeeDashboard
              user={currentUser}
              setSection={handleSectionChange}
              navigationState={sectionState}
            />
          );
        }

      case "progress":
        return <ProgressTracker user={currentUser} />;

      case "add":
        return canAccessSection(currentUser, "add") ? <UserForm currentUser={currentUser} /> : <AccessDenied />;

      case "users":
        return role === "Admin" ? <UserList /> : <AccessDenied />;

      case "manager":
        return role === "Admin" ? <ManagerInfo /> : <AccessDenied />;

      case "holidays":
        return canAccessSection(currentUser, "holidays") ? <AdminHolidays user={currentUser} /> : <AccessDenied />;

      case "apply-behalf":
        return canAccessSection(currentUser, "apply-behalf") ? <AdminApplyLeave user={currentUser} /> : <AccessDenied />;

      case "logs":
        return canAccessSection(currentUser, "logs") ? <AdminLogs user={currentUser} /> : <AccessDenied />;

      case "mail":
        return canAccessSection(currentUser, "mail") ? <MailAdmin user={currentUser} /> : <AccessDenied />;

      case "employees":
        if (role === "Admin" || hasAdminMenuAccess(currentUser, "employees")) {
          return (
            <EmployeeList
              user={currentUser}
              onNavigateToProfile={handleNavigateToProfile}
              isAdmin={true}
            />
          );
        } else if (role === "Manager") {
          return <EmployeeList user={currentUser} onNavigateToProfile={handleNavigateToProfile} />;
        }
        return <AccessDenied />;

      case "leaves":
        if (role === "Admin") {
          return <AdminLeaves user={currentUser} />;
        } else if (hasAdminMenuAccess(currentUser, "leaves")) {
          return (
            <DelegatedLeavesWorkspace
              user={currentUser}
              baseRole={role}
              navigationState={sectionState}
            />
          );
        } else if (role === "Manager") {
          return <ManagerLeaves user={currentUser} />;
        } else {
          return <EmployeeLeaves user={currentUser} navigationState={sectionState} />;
        }

      case "profile":
        return (
          <Profile
            user={currentUser}
            role={role}
            viewEmployeeId={viewEmployeeId}
            onUserUpdate={handleUserUpdate}
            onBack={() => {
              setViewEmployeeId(null);
              setSection(viewEmployeeId ? profileReturnSection || "dashboard" : "dashboard");
            }}
          />
        );

      case "calendar":
        return <Calendar user={currentUser} setSection={handleSectionChange} navigationState={sectionState} />;

      case "tea-coffee":
        return <TeaCoffee user={currentUser} />;

      case "policy":
        return <Policy user={currentUser} />;

      case "projects":
        return canAccessSection(currentUser, "projects") ? <Projects user={currentUser} /> : <AccessDenied />;

      case "access-management":
        return role === "Admin" ? <AccessManagement user={currentUser} onCurrentUserUpdate={handleUserUpdate} /> : <AccessDenied />;

      // ✅ Timesheets - available to all roles
      case "timesheets":
        return (
          <div className="timesheets-page-shell">
            <Timesheets user={currentUser} adminView={hasAdminMenuAccess(currentUser, "timesheets")} />
          </div>
        );

      case "payslips":
        return <Payslips user={currentUser} adminView={hasAdminMenuAccess(currentUser, "payslips")} />;

      default:
        if (role === "Admin") {
          return <AdminDashboard user={currentUser} onNavigate={handleSectionChange} />;
        } else if (role === "Manager") {
          return (
            <ManagerDashboard
              user={currentUser}
              onNavigate={handleSectionChange}
              onNavigateToProfile={handleNavigateToProfile}
            />
          );
        } else {
          return (
            <EmployeeDashboard
              user={currentUser}
              setSection={handleSectionChange}
              navigationState={sectionState}
            />
          );
        }
    }
  };

  return (
    <>
      <MobileScrollFix />
      <ForceScroll />
      <div className={`app-root ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <div
          className={`sidebar-backdrop ${isSidebarOpen ? "show" : ""}`}
          onClick={() => setIsSidebarOpen(false)}
        />
        {getFilteredSidebar()}
        <div className="main">
          <Topbar
            user={currentUser}
            onLogout={handleLogout}
            onNavigateToProfile={handleNavigateToProfile}
            onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
            isSidebarCollapsed={isSidebarCollapsed}
          />
          <div className="content">{renderSection()}</div>
          <EnterpriseAssistant user={currentUser} />
        </div>
      </div>
      <div className="portal-alert-stack" aria-live="polite" aria-atomic="true">
        {portalAlerts.map((alertItem) => (
          <div key={alertItem.id} className="portal-alert-toast" role="status">
            <div className="portal-alert-toast__title">Notification Alert</div>
            <div className="portal-alert-toast__message">{alertItem.text}</div>
            <button
              type="button"
              className="portal-alert-toast__close"
              onClick={() => dismissPortalAlert(alertItem.id)}
              aria-label="Dismiss alert"
            >
              OK
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export default App;
