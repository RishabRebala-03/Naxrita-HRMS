import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu, UserCircle2 } from "lucide-react";
import UniversalSearch from "./UniversalSearch";
import Notifications from "./Notifications";
import { formatTimeIST } from "../utils/dateTime";

const Topbar = ({ user, onLogout, onNavigateToProfile, onToggleSidebar, isSidebarCollapsed }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const containerRef = useRef(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 480;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!showDropdown) return undefined;

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }, 0);

    return () => {
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      if (isMobile) {
        document.body.style.overflow = "";
      }
    };
  }, [showDropdown, isMobile]);

  const portalTitle =
    user?.role === "Admin"
      ? "Administration"
      : user?.role === "Manager"
        ? "Manager Workspace"
        : "Employee Workspace";

  const liveTimeLabel = formatTimeIST(currentTime, "--:--:--");

  const dropdownStyle = {
    position: "fixed",
    top: 72,
    right: 12,
    left: "auto",
    minWidth: 240,
    maxWidth: "calc(100vw - 24px)",
  };

  const handleProfileClick = (event) => {
    event.stopPropagation();
    setShowDropdown(false);
    onNavigateToProfile(user._id || user.id);
  };

  const handleLogoutClick = (event) => {
    event.stopPropagation();
    setShowDropdown(false);
    onLogout();
  };

  return (
    <header className="topbar">
      <div className="topbar-title-group">
        <button
          className="mobile-menu-btn"
          onClick={onToggleSidebar}
          aria-label={isSidebarCollapsed ? "Open navigation" : "Toggle navigation"}
        >
          <Menu size={20} />
        </button>

        <div>
          <div className="topbar-kicker">Naxrita HRMS</div>
          <h2>{portalTitle}</h2>
        </div>

        <div className="desktop-only">
          <UniversalSearch currentUser={user} />
        </div>
      </div>

      <div className="topbar-actions">
        <Notifications currentUser={user} />
        <div className="topbar-live-time" aria-label={`Current time ${liveTimeLabel}`}>
          <span className="topbar-live-time-dot" />
          <span className="topbar-live-time-value">{liveTimeLabel}</span>
        </div>

        <div ref={containerRef} className="profile-dropdown-container" style={{ position: "relative" }}>
          <button
            className="profile-trigger"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              setShowDropdown((prev) => !prev);
            }}
            onTouchEnd={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setShowDropdown((prev) => !prev);
            }}
          >
            {user?.photoUrl ? (
              <img src={user.photoUrl} alt="profile" className="profile-avatar" />
            ) : (
              <div className="profile-avatar profile-avatar-fallback">
                {(user?.name || "U").charAt(0)}
              </div>
            )}

            <div className="profile-summary">
              <div className="profile-name">{user?.name}</div>
              <div className="profile-role">{user?.role}</div>
            </div>

            <ChevronDown size={16} className="profile-chevron" />
          </button>

          {showDropdown && (
            <>
              <div
                onClick={() => setShowDropdown(false)}
                onTouchEnd={(event) => {
                  event.preventDefault();
                  setShowDropdown(false);
                }}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(9, 30, 66, 0.18)",
                  zIndex: 9998,
                }}
              />

              <div className="profile-dropdown-menu" onClick={(event) => event.stopPropagation()} style={dropdownStyle}>
                <div className="profile-dropdown-header">
                  <div className="profile-dropdown-name">{user?.name}</div>
                  <div className="profile-dropdown-email">{user?.email}</div>
                </div>

                <button
                  onClick={handleProfileClick}
                  onTouchEnd={(event) => {
                    event.preventDefault();
                    handleProfileClick(event);
                  }}
                  className="profile-dropdown-action"
                >
                  <UserCircle2 size={16} />
                  <span>My Profile</span>
                </button>

                <div className="profile-dropdown-divider" />

                <button
                  onClick={handleLogoutClick}
                  onTouchEnd={(event) => {
                    event.preventDefault();
                    handleLogoutClick(event);
                  }}
                  className="profile-dropdown-action profile-dropdown-action-danger"
                >
                  <LogOut size={16} />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Topbar;
