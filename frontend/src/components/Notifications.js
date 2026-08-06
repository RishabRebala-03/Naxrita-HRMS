import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  BadgeAlert,
  BadgeCheck,
  BadgeX,
  Bell,
  BellOff,
  Ban,
  FileText,
  Trash2,
  X,
} from "lucide-react";

const cleanNotificationMessage = (message = "") =>
  message
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const getNotificationTarget = (notification = {}) => {
  if (notification.target?.section) {
    return notification.target;
  }

  const type = String(notification.type || "").toLowerCase();
  const msg = String(notification.message || "").toLowerCase();

  if (notification.related_timesheet_id || type.includes("timesheet") || msg.includes("timesheet")) {
    return {
      section: "timesheets",
      timesheetId: notification.related_timesheet_id,
      activeView: type.includes("submitted") || type.includes("escalated") || type.includes("pending") || msg.includes("submitted") || msg.includes("approval")
        ? "approvals"
        : "entry",
    };
  }

  const isTeamTarget = type.includes("request") || type.includes("escalated") || type.includes("pending") || type.includes("submit") || msg.includes("submitted") || msg.includes("request") || msg.includes("escalat");

  return {
    section: "leaves",
    leaveId: notification.related_leave_id || notification._id,
    activeTab: isTeamTarget ? "team-leaves" : "my-leaves",
  };
};

const Notifications = ({ currentUser, onNavigate }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const containerRef = useRef(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 480;

  const fetchNotifications = useCallback(async () => {
    try {
      const userId = currentUser?.id || currentUser?._id;
      if (!userId) return;

      const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
      const response = await axios.get(
        `${backendUrl}/api/notifications/${userId}`
      );

      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unreadCount || 0);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.id || currentUser?._id) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000);

      const handleRefresh = () => {
        fetchNotifications();
      };

      window.addEventListener("refreshNotifications", handleRefresh);

      return () => {
        clearInterval(interval);
        window.removeEventListener("refreshNotifications", handleRefresh);
      };
    }

    return undefined;
  }, [currentUser, fetchNotifications]);

  useEffect(() => {
    if (!showDropdown) return undefined;

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    if (isMobile) {
      document.body.style.overflow = "hidden";
    }

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

  const markAsRead = async (notificationId) => {
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
      await axios.put(
        `${backendUrl}/api/notifications/mark_read/${notificationId}`
      );
      fetchNotifications();
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      setLoading(true);
      const userId = currentUser?.id || currentUser?._id;
      const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
      await axios.put(
        `${backendUrl}/api/notifications/mark_all_read/${userId}`
      );
      fetchNotifications();
    } catch (error) {
      console.error("Error marking all as read:", error);
    } finally {
      setLoading(false);
    }
  };

  const clearAllNotifications = async () => {
    try {
      setLoading(true);
      const userId = currentUser?.id || currentUser?._id;
      const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
      await axios.delete(
        `${backendUrl}/api/notifications/clear_all/${userId}`
      );
      setNotifications([]);
      setUnreadCount(0);
      setShowClearConfirm(false);
      fetchNotifications();
    } catch (error) {
      console.error("Error clearing all notifications:", error);
      alert("Failed to clear notifications. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
      await axios.delete(
        `${backendUrl}/api/notifications/${notificationId}`
      );
      fetchNotifications();
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  };

  const getNotificationMeta = (type) => {
    switch (type) {
      case "leave_approved":
        return {
          icon: BadgeCheck,
          colors: { bg: "#eaf7ea", border: "#b9ddb9", icon: "#188918" },
        };
      case "leave_rejected":
        return {
          icon: BadgeX,
          colors: { bg: "#fff1f1", border: "#efc2c2", icon: "#bb0000" },
        };
      case "leave_request":
        return {
          icon: FileText,
          colors: { bg: "#edf6ff", border: "#bfdaf4", icon: "#0a6ed1" },
        };
      case "leave_cancelled":
        return {
          icon: Ban,
          colors: { bg: "#fff8e6", border: "#ebd28c", icon: "#8d5a00" },
        };
      case "leave_escalated":
      case "leave_escalated_reminder":
        return {
          icon: BadgeAlert,
          colors: { bg: "#fff4e5", border: "#f1c58f", icon: "#b76e00" },
        };
      case "timesheet_submitted":
      case "timesheet_submitted_reminder":
      case "timesheet_resubmitted_reminder":
        return {
          icon: FileText,
          colors: { bg: "#edf6ff", border: "#bfdaf4", icon: "#0a6ed1" },
        };
      case "timesheet_approved":
      case "timesheet_approved_reminder":
      case "timesheet_reapproved_reminder":
        return {
          icon: BadgeCheck,
          colors: { bg: "#eaf7ea", border: "#b9ddb9", icon: "#188918" },
        };
      case "timesheet_rejected":
      case "timesheet_rejected_reminder":
        return {
          icon: BadgeX,
          colors: { bg: "#fff1f1", border: "#efc2c2", icon: "#bb0000" },
        };
      default:
        return {
          icon: Bell,
          colors: { bg: "#f4f7fa", border: "#d2dbe4", icon: "#5b738b" },
        };
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";

    try {
      let date;

      if (typeof timestamp === "object" && timestamp.$date) {
        date = new Date(timestamp.$date);
      } else if (typeof timestamp === "string") {
        date = new Date(timestamp);
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else {
        return "";
      }

      if (Number.isNaN(date.getTime())) {
        return "";
      }

      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      });
    } catch (error) {
      console.error("Error formatting timestamp:", error, timestamp);
      return "";
    }
  };

  const handleToggleDropdown = (event) => {
    event.stopPropagation();
    event.preventDefault();
    setShowDropdown((previous) => !previous);
  };

  const handleBackdropClick = (event) => {
    event.stopPropagation();
    event.preventDefault();
    setShowDropdown(false);
  };

  const handleNotificationClick = (notification) => {
    if (!notification) return;

    if (!notification.read) {
      markAsRead(notification._id);
    }

    const target = getNotificationTarget(notification);
    if (target?.section && onNavigate) {
      onNavigate(target.section, target);
      setShowDropdown(false);
    }
  };

  const getDropdownStyle = () => {
    if (!isMobile) {
      return {
        position: "absolute",
        top: "calc(100% + 12px)",
        right: 0,
        width: 420,
        maxHeight: 600,
      };
    }

    if (containerRef.current && showDropdown) {
      const rect = containerRef.current.getBoundingClientRect();
      const topPosition = rect.bottom + 8;
      const viewportHeight = window.innerHeight;
      const maxHeight = viewportHeight - topPosition - 20;

      return {
        position: "fixed",
        top: topPosition,
        right: 12,
        left: 12,
        width: "auto",
        maxHeight: Math.min(maxHeight, viewportHeight * 0.7),
      };
    }

    return {
      position: "fixed",
      top: 72,
      right: 12,
      left: 12,
      width: "auto",
      maxHeight: "calc(100vh - 90px)",
    };
  };

  return (
    <div
      ref={containerRef}
      className="notifications-dropdown-container"
      style={{ position: "relative" }}
    >
      <button
        onClick={handleToggleDropdown}
        onTouchEnd={(event) => {
          event.preventDefault();
          handleToggleDropdown(event);
        }}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          background: "white",
          border: "1px solid #d9dfe6",
          borderRadius: "50%",
          cursor: "pointer",
          transition: "all 0.2s ease",
          color: "#1d2d3e",
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = "#f7f9fb";
          event.currentTarget.style.borderColor = "#bfd0df";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = "white";
          event.currentTarget.style.borderColor = "#d9dfe6";
        }}
        aria-label="Notifications"
      >
        <Bell size={18} />

        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "#bb0000",
              color: "white",
              borderRadius: "50%",
              width: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              border: "2px solid white",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <>
          <div
            onClick={handleBackdropClick}
            onTouchEnd={(event) => {
              event.preventDefault();
              handleBackdropClick(event);
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(9, 30, 66, 0.18)",
              zIndex: 9998,
            }}
          />

          <div
            className="notifications-dropdown-panel"
            onClick={(event) => event.stopPropagation()}
            style={{
              ...getDropdownStyle(),
              background: "white",
              border: "1px solid #d9dfe6",
              borderRadius: 12,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
              zIndex: 9999,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #e5ebf1",
                background: "#f7f9fb",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Notifications</h3>
                  {unreadCount > 0 && (
                    <p style={{ margin: 0, fontSize: 12, color: "#5b738b", marginTop: 2 }}>
                      {unreadCount} unread
                    </p>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    disabled={loading}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#0a6ed1",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: "4px 8px",
                    }}
                  >
                    {loading ? "..." : "Mark all read"}
                  </button>
                )}
              </div>

              {notifications.length > 0 && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  disabled={loading}
                  style={{
                    width: "100%",
                    marginTop: 8,
                    padding: "8px 12px",
                    background: "white",
                    border: "1px solid #d9dfe6",
                    borderRadius: 8,
                    color: "#bb0000",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Trash2 size={14} />
                  <span>Clear all notifications</span>
                </button>
              )}
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
              }}
            >
              {notifications.length === 0 ? (
                <div
                  style={{
                    padding: 40,
                    textAlign: "center",
                    color: "#5b738b",
                  }}
                >
                  <BellOff size={40} style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: 14 }}>No notifications yet</div>
                </div>
              ) : (
                notifications.map((notification) => {
                  const { colors, icon: Icon } = getNotificationMeta(notification.type);
                  return (
                    <div
                      key={notification._id}
                      role="button"
                      tabIndex={0}
                      style={{
                        padding: isMobile ? 16 : 14,
                        borderBottom: "1px solid #eef2f6",
                        background: notification.read ? "white" : "#f8fbfe",
                        cursor: "pointer",
                        transition: "background 0.2s",
                        position: "relative",
                        minHeight: isMobile ? 60 : "auto",
                      }}
                      onMouseEnter={(event) => {
                        if (notification.read) event.currentTarget.style.background = "#f9fafb";
                      }}
                      onMouseLeave={(event) => {
                        if (notification.read) event.currentTarget.style.background = "white";
                      }}
                      onClick={() => {
                        handleNotificationClick(notification);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleNotificationClick(notification);
                        }
                      }}
                    >
                      <div style={{ display: "flex", gap: 12 }}>
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: "50%",
                            background: colors.bg,
                            border: `1px solid ${colors.border}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: colors.icon,
                            flexShrink: 0,
                          }}
                        >
                          <Icon size={18} />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: notification.read ? 400 : 600,
                              color: "#1d2d3e",
                              marginBottom: 4,
                              lineHeight: 1.4,
                            }}
                          >
                            {cleanNotificationMessage(notification.message)}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#5b738b",
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span>{formatTimestamp(notification.createdAt)}</span>
                            {!notification.read && (
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  background: "#0a6ed1",
                                }}
                              />
                            )}
                          </div>
                        </div>

                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteNotification(notification._id);
                          }}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#5b738b",
                            cursor: "pointer",
                            padding: 4,
                            lineHeight: 1,
                            flexShrink: 0,
                            minWidth: 28,
                            minHeight: 28,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {showClearConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(9, 30, 66, 0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            style={{
              background: "white",
              padding: 28,
              borderRadius: 12,
              maxWidth: 400,
              width: "90%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, color: "#bb0000" }}>
              <Trash2 size={36} />
            </div>
            <h3
              style={{
                margin: 0,
                marginBottom: 12,
                fontSize: 20,
                fontWeight: 600,
                textAlign: "center",
              }}
            >
              Clear all notifications?
            </h3>
            <p
              style={{
                margin: 0,
                marginBottom: 24,
                color: "#5b738b",
                fontSize: 14,
                textAlign: "center",
                lineHeight: 1.5,
              }}
            >
              This will permanently delete all {notifications.length} notification
              {notifications.length !== 1 ? "s" : ""}. This action cannot be undone.
            </p>

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setShowClearConfirm(false)}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: "10px 20px",
                  background: "#f3f4f6",
                  color: "#374151",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={clearAllNotifications}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: "10px 20px",
                  background: "#bb0000",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "Clearing..." : "Clear all"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
