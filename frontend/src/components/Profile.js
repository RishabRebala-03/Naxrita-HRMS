import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  Clock,
  Copy,
  FileText,
  IdCard,
  KeyRound,
  MapPin,
  PencilLine,
  RotateCcw,
  Shield,
  UserRound,
  Users,
} from "lucide-react";
import { buildRequesterHeaders } from "../utils/requester";
import ValueHelpSelect from "./ValueHelpSelect";
import ValueHelpSearch from "./ValueHelpSearch";

const API_BASE = process.env.REACT_APP_BACKEND_URL
  ? `${process.env.REACT_APP_BACKEND_URL}/api`
  : "http://localhost:5000/api";

const profileTabs = [
  { key: "personal", label: "Personal Information", Icon: UserRound },
  { key: "projects", label: "Projects", Icon: BriefcaseBusiness },
  { key: "payslip", label: "Payslip", Icon: FileText },
  { key: "timesheet", label: "Timesheet", Icon: Clock },
  { key: "leaves", label: "Leaves", Icon: CalendarDays },
];

const cleanDate = (value) => {
  if (!value) return null;

  return String(value)
    .replace(/\.\d+/, "")
    .replace("Z", "")
    .replace("+00:00", "")
    .trim();
};

const initialProfileTabFilters = {
  projects: { search: "", status: "All", startFrom: "", startTo: "", sortBy: "startDate", sortOrder: "desc" },
  payslip: { search: "", status: "All", generatedFrom: "", generatedTo: "", sortBy: "generatedDate", sortOrder: "desc" },
  timesheet: { search: "", status: "All", periodFrom: "", periodTo: "", sortBy: "periodStart", sortOrder: "desc" },
  leaves: { search: "", status: "All", type: "All", startFrom: "", startTo: "", sortBy: "startDate", sortOrder: "desc" },
};

const normalizeText = (value) => String(value ?? "").trim().toLowerCase();

const getDateTime = (value) => {
  if (!value) return 0;
  const date = new Date(cleanDate(value));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const isWithinDateFilter = (value, from, to) => {
  const time = getDateTime(value);
  if (!time) return !(from || to);
  if (from && time < getDateTime(from)) return false;
  if (to && time > getDateTime(to)) return false;
  return true;
};

const compareValues = (left, right, order = "asc") => {
  const direction = order === "desc" ? -1 : 1;
  if (typeof left === "number" || typeof right === "number") {
    return ((left || 0) - (right || 0)) * direction;
  }
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true, sensitivity: "base" }) * direction;
};

const uniqueOptions = (items, getter, allLabel = "All") => [
  { value: "All", label: allLabel },
  ...Array.from(new Set(items.map(getter).filter(Boolean).map(String))).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value })),
];

const Profile = ({ user, role, viewEmployeeId = null, onUserUpdate, onBack, onOpenRecord, initialTab = "personal" }) => {
  const requesterHeaders = buildRequesterHeaders(user);
  const [employeeId, setEmployeeId] = useState("");
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");
  const [payslips, setPayslips] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [leaveHistory, setLeaveHistory] = useState([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabMessage, setTabMessage] = useState("");
  const [selectedProfileRecord, setSelectedProfileRecord] = useState(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectForm, setProjectForm] = useState({
    _id: null,
    projectId: "",
    name: "",
    startDate: "",
    endDate: "",
  });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [availableProjects, setAvailableProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [profileTabFilters, setProfileTabFilters] = useState(initialProfileTabFilters);

  const formatDate = useCallback((dateValue) => {
    if (!dateValue) return "Not available";

    try {
      const date = new Date(cleanDate(dateValue));
      if (Number.isNaN(date.getTime())) return "Not available";

      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Not available";
    }
  }, []);

  const dateToInputFormat = (value) => {
    if (!value) return "";

    const date = new Date(cleanDate(value));
    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const formatProjectDate = (dateValue) => {
    if (!dateValue) return "Present";

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "Present";

    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  };

  const formatDateRange = useCallback((start, end) => {
    const formattedStart = formatDate(start);
    const formattedEnd = formatDate(end);

    if (formattedStart === "Not available" && formattedEnd === "Not available") {
      return "Not available";
    }

    if (formattedEnd === "Not available" || formattedStart === formattedEnd) {
      return formattedStart;
    }

    return `${formattedStart} to ${formattedEnd}`;
  }, [formatDate]);

  const getTimesheetHours = (timesheet) => {
    if (timesheet.total_hours !== undefined) return timesheet.total_hours;
    if (timesheet.totalHours !== undefined) return timesheet.totalHours;

    return (timesheet.entries || []).reduce(
      (total, entry) => total + Number(entry.hours || entry.total_hours || 0),
      0
    );
  };

  const openProfileRecord = (type, record) => {
    if (type !== "project" && typeof onOpenRecord === "function") {
      onOpenRecord(type, record, employeeId || viewEmployeeId, activeTab);
      return;
    }
    setSelectedProfileRecord({ type, record });
  };

  useEffect(() => setActiveTab(initialTab || "personal"), [initialTab]);

  const calculateTenure = (startDate) => {
    if (!startDate) return "Not available";

    const date = new Date(cleanDate(startDate));
    if (Number.isNaN(date.getTime())) return "Not available";

    const today = new Date();
    if (date > today) return "0 years 0 months 0 days";

    let years = today.getFullYear() - date.getFullYear();
    let months = today.getMonth() - date.getMonth();
    let days = today.getDate() - date.getDate();

    if (days < 0) {
      months -= 1;
      days += new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    }

    if (months < 0) {
      years -= 1;
      months += 12;
    }

    return `${years} years ${months} months ${days} days`;
  };

  const resetEditForm = (data) => {
    setEditForm({
      name: data.name || "",
      email: data.email || "",
      designation: data.designation || "",
      department: data.department || "",
      shiftTimings: data.shiftTimings || "",
      dateOfJoining: dateToInputFormat(data.dateOfJoining),
      dateOfBirth: dateToInputFormat(data.dateOfBirth),
      reportsToEmail: data.reportsToEmail || "",
      workLocation: data.workLocation || "",
      companyCode: data.companyCode || "",
      costCenter: data.costCenter || "",
      peopleLeadEmail: data.peopleLeadEmail || "",
    });
  };

  const fetchAvailableProjects = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/projects/`);
      const data = await response.json();
      setAvailableProjects(data);
    } catch (error) {
      console.error("Error fetching projects:", error);
    }
  };

  const fetchProfile = async (userId) => {
    if (!userId || typeof userId !== "string" || !/^[a-f0-9]{24}$/i.test(userId)) {
      setMessage("Invalid user ID format");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/users/${userId}`);

      if (!response.ok) {
        const error = await response.json();
        setMessage(error.error || "Employee not found");
        setProfile(null);
        return;
      }

      const data = await response.json();
      setProfile(data);
      resetEditForm(data);
      setMessage("");
      fetchProfileTabData(userId, data);
    } catch (error) {
      console.error("Error fetching profile:", error);
      setMessage("Failed to fetch profile");
    } finally {
      setLoading(false);
    }
  };

  const fetchProfileTabData = async (userId, profileData = profile) => {
    if (!userId || typeof userId !== "string" || !/^[a-f0-9]{24}$/i.test(userId)) return;

    setTabLoading(true);
    setTabMessage("");

    try {
      const [payslipResponse, timesheetResponse, leaveResponse] = await Promise.all([
        fetch(`${API_BASE}/payslips?user_id=${encodeURIComponent(user?.id || userId)}`),
        fetch(`${API_BASE}/timesheets/employee/${userId}`),
        fetch(`${API_BASE}/leaves/history/${userId}`),
      ]);

      const [payslipData, timesheetData, leaveData] = await Promise.all([
        payslipResponse.ok ? payslipResponse.json() : Promise.resolve({ payslips: [] }),
        timesheetResponse.ok ? timesheetResponse.json() : Promise.resolve([]),
        leaveResponse.ok ? leaveResponse.json() : Promise.resolve([]),
      ]);

      const currentEmployeeKeys = new Set(
        [profileData?.employeeId, profileData?._id, userId].filter(Boolean).map((value) => String(value))
      );

      setPayslips(
        (Array.isArray(payslipData?.payslips) ? payslipData.payslips : []).filter((item) =>
          currentEmployeeKeys.has(String(item.employee_id || item.user_id || ""))
        )
      );
      setTimesheets(Array.isArray(timesheetData) ? timesheetData : []);
      setLeaveHistory(Array.isArray(leaveData) ? leaveData : []);
    } catch (error) {
      console.error("Error fetching profile tab data:", error);
      setTabMessage("Some profile records could not be loaded.");
      setPayslips([]);
      setTimesheets([]);
      setLeaveHistory([]);
    } finally {
      setTabLoading(false);
    }
  };

  useEffect(() => {
    let targetId = null;

    if (viewEmployeeId) {
      if (typeof viewEmployeeId === "object" && viewEmployeeId !== null) {
        targetId = viewEmployeeId._id || viewEmployeeId.id || viewEmployeeId.employeeId || null;
      } else {
        targetId = viewEmployeeId;
      }
    } else if (user?.id) {
      targetId = user.id;
    }

    if (!targetId || typeof targetId !== "string" || !/^[a-f0-9]{24}$/i.test(targetId)) {
      setMessage("Invalid employee ID");
      setLoading(false);
      return;
    }

    setEmployeeId(targetId);
    fetchProfile(targetId);

    if (role === "Admin") {
      fetchAvailableProjects();
    }
  }, [viewEmployeeId, user, role]);

  const handleEdit = () => {
    setIsEditing(true);
    setMessage("");
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (profile) {
      resetEditForm(profile);
    }
    setMessage("");
  };

  const handleInputChange = (field, value) => {
    setEditForm((previous) => ({ ...previous, [field]: value }));
  };

  const handleEditProject = (project) => {
    setProjectForm({
      _id: project._id,
      projectId: project.projectId,
      name: project.projectName || project.name,
      startDate: dateToInputFormat(project.startDate),
      endDate: project.endDate ? dateToInputFormat(project.endDate) : "",
    });
    setSelectedProjectId(project.projectId ? String(project.projectId) : "");
    setShowProjectModal(true);
  };

  const deleteProject = async (projectId) => {
    if (!projectId || projectId === "undefined") {
      alert("Cannot delete project: Invalid project ID");
      return;
    }

    if (!window.confirm("Remove this project assignment?")) return;

    await fetch(
      `${process.env.REACT_APP_BACKEND_URL}/api/users/delete_project/${employeeId}/${projectId}`,
      {
        method: "DELETE",
        headers: requesterHeaders,
      }
    );

    fetchProfile(employeeId);
  };

  const saveProject = async () => {
    if (!selectedProjectId && !projectForm._id) {
      setMessage("Please select a project");
      return;
    }

    if (!projectForm.startDate) {
      setMessage("Please select a start date");
      return;
    }

    const url = projectForm._id
      ? `${process.env.REACT_APP_BACKEND_URL}/api/users/update_project/${employeeId}/${projectForm._id}`
      : `${process.env.REACT_APP_BACKEND_URL}/api/users/assign_project/${employeeId}`;

    const payload = projectForm._id
      ? {
          startDate: projectForm.startDate,
          endDate: projectForm.endDate || null,
        }
      : {
          projectId: selectedProjectId,
          startDate: projectForm.startDate,
          endDate: projectForm.endDate || null,
        };

    try {
      const response = await fetch(url, {
        method: projectForm._id ? "PUT" : "POST",
        headers: buildRequesterHeaders(user, { "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage("Project assignment updated successfully.");
        setShowProjectModal(false);
        setSelectedProjectId("");
        fetchProfile(employeeId);
        setTimeout(() => setMessage(""), 3000);
      } else {
        setMessage(data.error || "Failed to save project");
      }
    } catch {
      setMessage("Network error");
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const updateData = {
        name: editForm.name,
        email: editForm.email,
        designation: editForm.designation,
        department: editForm.department,
        shiftTimings: editForm.shiftTimings,
        reportsToEmail: editForm.reportsToEmail || "",
        workLocation: editForm.workLocation || "",
        companyCode: editForm.companyCode || "",
        costCenter: editForm.costCenter || "",
        peopleLeadEmail: editForm.peopleLeadEmail || "",
      };

      if (editForm.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(editForm.dateOfBirth.trim())) {
        updateData.dateOfBirth = editForm.dateOfBirth.trim();
      } else {
        updateData.dateOfBirth = null;
      }

      if (editForm.dateOfJoining && /^\d{4}-\d{2}-\d{2}$/.test(editForm.dateOfJoining.trim())) {
        updateData.dateOfJoining = editForm.dateOfJoining.trim();
      } else {
        updateData.dateOfJoining = null;
      }

      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/update_user/${employeeId}`,
        {
          method: "PUT",
          headers: buildRequesterHeaders(user, { "Content-Type": "application/json" }),
          body: JSON.stringify(updateData),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setMessage("Profile updated successfully.");
        setIsEditing(false);
        await fetchProfile(employeeId);

        if (user?.id === employeeId && onUserUpdate) {
          const updatedUserResponse = await fetch(
            `${process.env.REACT_APP_BACKEND_URL}/api/users/${employeeId}`
          );
          const updatedUser = await updatedUserResponse.json();

          onUserUpdate({
            ...user,
            photoUrl: updatedUser.photoUrl,
            name: updatedUser.name,
            email: updatedUser.email,
          });
        }
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error(error);
      setMessage("Network error");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text || "");
    setMessage(`${label} copied to clipboard`);
    setTimeout(() => setMessage(""), 2000);
  };

  const handlePasswordChange = async () => {
    setPasswordError("");

    if (role === "Admin" && !isOwnProfile) {
      if (!passwordForm.newPassword || !passwordForm.confirmPassword) {
        setPasswordError("New password and confirmation are required");
        return;
      }
    } else if (
      !passwordForm.currentPassword ||
      !passwordForm.newPassword ||
      !passwordForm.confirmPassword
    ) {
      setPasswordError("All fields are required");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters");
      return;
    }

    if (isOwnProfile && passwordForm.currentPassword === passwordForm.newPassword) {
      setPasswordError("New password must be different from current password");
      return;
    }

    setLoading(true);
    try {
      const requestBody = { password: passwordForm.newPassword };

      if (isOwnProfile) {
        requestBody.currentPassword = passwordForm.currentPassword;
      }

      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/update_user/${employeeId}`,
        {
          method: "PUT",
          headers: buildRequesterHeaders(user, { "Content-Type": "application/json" }),
          body: JSON.stringify(requestBody),
        }
      );

      const data = await response.json();

      if (response.ok) {
        setMessage(
          role === "Admin" && !isOwnProfile
            ? `Password changed successfully for ${profile?.name}.`
            : "Password changed successfully."
        );
        setShowPasswordModal(false);
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setTimeout(() => setMessage(""), 3000);
      } else {
        setPasswordError(data.error || "Failed to change password");
      }
    } catch {
      setPasswordError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const isOwnProfile = user?.id === employeeId;
  const canEditProfile = role === "Admin";
  const canChangePassword = role === "Admin" || isOwnProfile;
  const canChangePhoto = role === "Admin" || isOwnProfile;

  const backLabel = viewEmployeeId ? "Back to Employees" : "Back to Dashboard";

  const profileProjects = useMemo(
    () => (Array.isArray(profile?.projects) ? profile.projects.filter(Boolean) : []),
    [profile]
  );

  const updateTabFilter = (tab, field, value) => {
    setProfileTabFilters((current) => ({
      ...current,
      [tab]: {
        ...current[tab],
        [field]: value,
      },
    }));
  };

  const resetTabFilter = (tab) => {
    setProfileTabFilters((current) => ({
      ...current,
      [tab]: initialProfileTabFilters[tab],
    }));
  };

  const hasActiveTabFilter = (tab) =>
    Object.entries(profileTabFilters[tab]).some(
      ([field, value]) => String(value ?? "") !== String(initialProfileTabFilters[tab][field] ?? "")
    );

  const filteredProjects = useMemo(() => {
    const filters = profileTabFilters.projects;
    const query = normalizeText(filters.search);

    return [...profileProjects]
      .filter((project) => {
        const endTime = getDateTime(project.endDate);
        const projectStatus = endTime && endTime < Date.now() ? "Completed" : "Active";
        const haystack = [
          project.projectName,
          project.name,
          project.projectId,
          projectStatus,
        ].map(normalizeText).join(" ");

        return (
          (!query || haystack.includes(query)) &&
          (filters.status === "All" || projectStatus === filters.status) &&
          isWithinDateFilter(project.startDate, filters.startFrom, filters.startTo)
        );
      })
      .sort((a, b) => {
        const getValue = (project) => {
          if (filters.sortBy === "project") return project.projectName || project.name || "";
          if (filters.sortBy === "endDate") return getDateTime(project.endDate);
          if (filters.sortBy === "status") {
            const endTime = getDateTime(project.endDate);
            return endTime && endTime < Date.now() ? "Completed" : "Active";
          }
          return getDateTime(project.startDate);
        };

        return compareValues(getValue(a), getValue(b), filters.sortOrder);
      });
  }, [profileProjects, profileTabFilters.projects]);

  const filteredPayslips = useMemo(() => {
    const filters = profileTabFilters.payslip;
    const query = normalizeText(filters.search);

    return [...payslips]
      .filter((item) => {
        const status = item.published ? "Published" : "Draft";
        const generatedDate = item.generated_at || item.created_at;
        const haystack = [
          item.month,
          item.year,
          item.period_key,
          item.employee_name,
          status,
        ].map(normalizeText).join(" ");

        return (
          (!query || haystack.includes(query)) &&
          (filters.status === "All" || status === filters.status) &&
          isWithinDateFilter(generatedDate, filters.generatedFrom, filters.generatedTo)
        );
      })
      .sort((a, b) => {
        const getValue = (item) => {
          if (filters.sortBy === "period") return `${item.year || ""}-${item.month || item.period_key || ""}`;
          if (filters.sortBy === "status") return item.published ? "Published" : "Draft";
          return getDateTime(item.generated_at || item.created_at);
        };

        return compareValues(getValue(a), getValue(b), filters.sortOrder);
      });
  }, [payslips, profileTabFilters.payslip]);

  const filteredTimesheets = useMemo(() => {
    const filters = profileTabFilters.timesheet;
    const query = normalizeText(filters.search);

    return [...timesheets]
      .filter((item) => {
        const status = item.status || "draft";
        const haystack = [
          formatDateRange(item.period_start, item.period_end),
          status,
          getTimesheetHours(item),
          item.entries?.length || 0,
        ].map(normalizeText).join(" ");

        return (
          (!query || haystack.includes(query)) &&
          (filters.status === "All" || normalizeText(status) === normalizeText(filters.status)) &&
          isWithinDateFilter(item.period_start, filters.periodFrom, filters.periodTo)
        );
      })
      .sort((a, b) => {
        const getValue = (item) => {
          if (filters.sortBy === "status") return item.status || "draft";
          if (filters.sortBy === "hours") return Number(getTimesheetHours(item) || 0);
          if (filters.sortBy === "entries") return Number(item.entries?.length || 0);
          return getDateTime(item.period_start);
        };

        return compareValues(getValue(a), getValue(b), filters.sortOrder);
      });
  }, [formatDateRange, profileTabFilters.timesheet, timesheets]);

  const leaveTypeOptions = useMemo(
    () => uniqueOptions(leaveHistory, (item) => item.leave_type || item.leaveType),
    [leaveHistory]
  );

  const filteredLeaves = useMemo(() => {
    const filters = profileTabFilters.leaves;
    const query = normalizeText(filters.search);

    return [...leaveHistory]
      .filter((item) => {
        const type = item.leave_type || item.leaveType || "Leave";
        const status = item.status || "Pending";
        const haystack = [
          type,
          status,
          formatDateRange(item.start_date, item.end_date),
          item.approved_days || item.days || 0,
        ].map(normalizeText).join(" ");

        return (
          (!query || haystack.includes(query)) &&
          (filters.status === "All" || status === filters.status) &&
          (filters.type === "All" || type === filters.type) &&
          isWithinDateFilter(item.start_date, filters.startFrom, filters.startTo)
        );
      })
      .sort((a, b) => {
        const getValue = (item) => {
          if (filters.sortBy === "type") return item.leave_type || item.leaveType || "";
          if (filters.sortBy === "status") return item.status || "Pending";
          if (filters.sortBy === "days") return Number(item.approved_days || item.days || 0);
          return getDateTime(item.start_date);
        };

        return compareValues(getValue(a), getValue(b), filters.sortOrder);
      });
  }, [formatDateRange, leaveHistory, profileTabFilters.leaves]);

  const renderProfileTabFilters = (tab, config) => {
    const filters = profileTabFilters[tab];

    return (
      <div className="profile-tab-filter-bar">
        <label className="employee-filter-field profile-tab-filter-search">
          <span>Search</span>
          <ValueHelpSearch
            value={filters.search}
            onChange={(value) => updateTabFilter(tab, "search", value)}
            suggestions={config.searchSuggestions || []}
            placeholder={config.searchPlaceholder}
          />
        </label>

        {config.fields.map((field) => (
          <label key={field.key} className="employee-filter-field">
            <span>{field.label}</span>
            {field.type === "date" ? (
              <input
                className="input"
                type="date"
                value={filters[field.key]}
                onChange={(event) => updateTabFilter(tab, field.key, event.target.value)}
              />
            ) : (
              <ValueHelpSelect
                value={filters[field.key]}
                onChange={(value) => updateTabFilter(tab, field.key, value)}
                searchPlaceholder={field.searchPlaceholder || `Search ${field.label.toLowerCase()}`}
                options={field.options}
              />
            )}
          </label>
        ))}

        <label className="employee-filter-field">
          <span>Sort By</span>
          <ValueHelpSelect
            value={filters.sortBy}
            onChange={(value) => updateTabFilter(tab, "sortBy", value)}
            searchPlaceholder="Search sort options"
            options={config.sortOptions}
          />
        </label>

        <label className="employee-filter-field">
          <span>Sort Order</span>
          <ValueHelpSelect
            value={filters.sortOrder}
            onChange={(value) => updateTabFilter(tab, "sortOrder", value)}
            searchPlaceholder="Search order"
            options={[
              { value: "asc", label: "Ascending" },
              { value: "desc", label: "Descending" },
            ]}
          />
        </label>

        <div className="employee-filter-field profile-tab-filter-actions">
          <span>Actions</span>
          <button
            type="button"
            className="fiori-button secondary compact"
            onClick={() => resetTabFilter(tab)}
            disabled={!hasActiveTabFilter(tab)}
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
      </div>
    );
  };

  if (loading && !profile) {
    return (
      <section className="profile-workspace">
        <div className="fiori-loading-card">
          <UserRound size={28} />
          <div>
            <strong>Loading profile</strong>
            <p>Preparing employee information and assignments.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="profile-workspace">
      <div className="profile-nav-row">
        <button className="fiori-button secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>{backLabel}</span>
        </button>
      </div>

      <header className="profile-hero">
        <div className="profile-hero-main">
          <div className="profile-avatar-shell">
            <img
              src={
                profile?.photoUrl ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.name || "User")}`
              }
              alt={profile?.name || "Profile"}
              className="profile-hero-avatar"
            />
          </div>

          <div>
            <div className="admin-section-overline">
              {isOwnProfile ? "Self Profile" : "Employee Profile"}
            </div>
            <h1>{profile?.name || "Profile"}</h1>
            <p>{profile?.designation || "Designation not available"}</p>
            <div className="profile-hero-meta">
              <span>{profile?.department || "Department not assigned"}</span>
              <span>{profile?.role || "Employee"}</span>
              <span>{profile?.workLocation || "Work location not set"}</span>
            </div>
          </div>
        </div>

        <div className="profile-hero-actions">
          {canEditProfile && (
            <button className="fiori-button primary" onClick={handleEdit}>
              <PencilLine size={16} />
              <span>Edit Profile</span>
            </button>
          )}

          {canChangePassword && (
            <button className="fiori-button secondary" onClick={() => setShowPasswordModal(true)}>
              <KeyRound size={16} />
              <span>Change Password</span>
            </button>
          )}

          {canChangePhoto && (
            <>
              <button
                className="fiori-button secondary"
                onClick={() => document.getElementById("uploadPhotoInput").click()}
              >
                <Camera size={16} />
                <span>Change Photo</span>
              </button>

              <input
                type="file"
                id="uploadPhotoInput"
                style={{ display: "none" }}
                accept="image/png,image/jpeg,image/webp"
                onChange={async (event) => {
                  if (!event.target.files.length) return;

                  const file = event.target.files[0];

                  if (file.size > 2 * 1024 * 1024) {
                    setMessage("Error: File size must be under 2 MB");
                    return;
                  }

                  const formData = new FormData();
                  formData.append("photo", file);

                  const response = await fetch(
                    `${process.env.REACT_APP_BACKEND_URL}/api/users/upload_photo/${employeeId}`,
                    {
                      method: "POST",
                      headers: requesterHeaders,
                      body: formData,
                    }
                  );

                  const data = await response.json();

                  if (response.ok) {
                    setMessage("Profile photo updated successfully.");
                    fetchProfile(employeeId);
                  } else {
                    setMessage(`Error: ${data.error}`);
                  }
                }}
              />
            </>
          )}
        </div>
      </header>

      {!isEditing && profile && (
        <>
          <div className="profile-tab-strip" role="tablist" aria-label="Employee profile sections">
            {profileTabs.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                className={`profile-tab-button ${activeTab === key ? "is-active" : ""}`}
                onClick={() => setActiveTab(key)}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {activeTab === "personal" && (
            <>
          <div className="profile-summary-grid">
            <article className="fiori-stat-card">
              <div className="fiori-stat-topline">
                <span className="fiori-stat-label">Employee ID</span>
                <IdCard size={18} />
              </div>
              <div className="fiori-stat-note is-mono">{profile.employeeId || profile._id}</div>
            </article>
            <article className="fiori-stat-card">
              <div className="fiori-stat-topline">
                <span className="fiori-stat-label">Date of Joining</span>
                <CalendarDays size={18} />
              </div>
              <div className="fiori-stat-note">{formatDate(profile.dateOfJoining)}</div>
            </article>
            <article className="fiori-stat-card">
              <div className="fiori-stat-topline">
                <span className="fiori-stat-label">Tenure</span>
                <BadgeCheck size={18} />
              </div>
              <div className="fiori-stat-note">{calculateTenure(profile.dateOfJoining)}</div>
            </article>
            <article className="fiori-stat-card">
              <div className="fiori-stat-topline">
                <span className="fiori-stat-label">Assigned Projects</span>
                <BriefcaseBusiness size={18} />
              </div>
              <div className="fiori-stat-note">{profileProjects.length}</div>
            </article>
          </div>

          <div className="profile-layout profile-layout-single">
            <div className="profile-main">
              <section className="fiori-panel">
                <div className="fiori-panel-header">
                  <div>
                    <h3>Contact and identity</h3>
                    <p>Primary identifiers and day-to-day communication details</p>
                  </div>
                </div>

                <div className="profile-info-grid">
                  <div className="profile-info-card">
                    <div className="profile-info-label">Email</div>
                    <div className="profile-info-value with-action">
                      <span>{profile.email || "Not available"}</span>
                      <button
                        className="fiori-inline-button"
                        onClick={() => copyToClipboard(profile.email, "Email")}
                      >
                        <Copy size={14} />
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>

                  <div className="profile-info-card">
                    <div className="profile-info-label">Date of Birth</div>
                    <div className="profile-info-value">{formatDate(profile.dateOfBirth)}</div>
                  </div>

                  <div className="profile-info-card">
                    <div className="profile-info-label">Work Location</div>
                    <div className="profile-info-value">
                      <MapPin size={14} />
                      <span>{profile.workLocation || "Not set"}</span>
                    </div>
                  </div>

                  <div className="profile-info-card">
                    <div className="profile-info-label">Company Code</div>
                    <div className="profile-info-value">{profile.companyCode || "Not set"}</div>
                  </div>

                  <div className="profile-info-card">
                    <div className="profile-info-label">Cost Center</div>
                    <div className="profile-info-value">{profile.costCenter || "Not set"}</div>
                  </div>

                  <div className="profile-info-card">
                    <div className="profile-info-label">Shift Timings</div>
                    <div className="profile-info-value">{profile.shiftTimings || "Not set"}</div>
                  </div>
                </div>
              </section>

              <section className="fiori-panel">
                <div className="fiori-panel-header">
                  <div>
                    <h3>Reporting and assignment</h3>
                    <p>Manager, talent lead, and current assignment structure</p>
                  </div>
                </div>

                <div className="profile-info-grid">
                  <div className="profile-info-card">
                    <div className="profile-info-label">Reports To</div>
                    <div className="profile-info-value">{profile.reportsToEmail || "Not assigned"}</div>
                  </div>

                  <div className="profile-info-card">
                    <div className="profile-info-label">Talent Lead</div>
                    <div className="profile-info-value">{profile.peopleLeadEmail || "Not assigned"}</div>
                  </div>

                  <div className="profile-info-card">
                    <div className="profile-info-label">Role</div>
                    <div className="profile-info-value">
                      <Shield size={14} />
                      <span>{profile.role || "Employee"}</span>
                    </div>
                  </div>

                  <div className="profile-info-card">
                    <div className="profile-info-label">Department</div>
                    <div className="profile-info-value">
                      <Users size={14} />
                      <span>{profile.department || "Not assigned"}</span>
                    </div>
                  </div>
                </div>
              </section>

            </div>

          </div>
            </>
          )}

          {activeTab === "projects" && (
            <section className="fiori-panel">
              <div className="fiori-panel-header">
                <div>
                  <h3>Projects</h3>
                  <p>Showing {filteredProjects.length} of {profileProjects.length} assignment(s)</p>
                </div>
                {role === "Admin" && (
                  <button
                    className="fiori-button secondary"
                    onClick={() => {
                      setProjectForm({
                        _id: null,
                        projectId: "",
                        name: "",
                        startDate: dateToInputFormat(new Date()),
                        endDate: "",
                      });
                      setSelectedProjectId("");
                      setShowProjectModal(true);
                    }}
                  >
                    Assign Project
                  </button>
                )}
              </div>
              {renderProfileTabFilters("projects", {
                searchPlaceholder: "Search project, code, or status",
                fields: [
                  { key: "status", label: "Status", options: [{ value: "All", label: "All" }, { value: "Active", label: "Active" }, { value: "Completed", label: "Completed" }] },
                  { key: "startFrom", label: "Start From", type: "date" },
                  { key: "startTo", label: "Start To", type: "date" },
                ],
                sortOptions: [
                  { value: "startDate", label: "Start date" },
                  { value: "endDate", label: "End date" },
                  { value: "project", label: "Project" },
                  { value: "status", label: "Status" },
                ],
              })}

              {filteredProjects.length > 0 ? (
                <div className="fiori-table-shell">
                  <table className="fiori-table">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Duration</th>
                        {role === "Admin" ? <th>Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProjects.map((project) => {
                        const startDate = new Date(project.startDate);
                        const endDate = project.endDate ? new Date(project.endDate) : new Date();
                        let duration = "Not available";

                        if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
                          const totalDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
                          const months = Math.floor(totalDays / 30);
                          const days = totalDays % 30;
                          duration = project.endDate
                            ? `${months} months ${days} days`
                            : `Ongoing • ${months} months ${days} days`;
                        }

                        return (
                          <tr key={project._id} className="profile-record-row" onClick={() => openProfileRecord("project", project)} tabIndex={0} role="button" onKeyDown={(event) => event.key === "Enter" && openProfileRecord("project", project)}>
                            <td>
                              <div className="fiori-primary-cell">
                                <strong>{project.projectName || project.name}</strong>
                                <span>{project.projectId || "Assigned project"}</span>
                              </div>
                            </td>
                            <td>{formatProjectDate(project.startDate)}</td>
                            <td>{formatProjectDate(project.endDate)}</td>
                            <td>{duration}</td>
                            {role === "Admin" ? (
                              <td>
                                <div className="employee-table-actions">
                                  <button className="fiori-button secondary" onClick={() => handleEditProject(project)}>
                                    Edit
                                  </button>
                                  <button
                                    className="fiori-button secondary danger"
                                    onClick={() => deleteProject(project._id)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="admin-empty-state">
                  <BriefcaseBusiness size={24} />
                  <div>
                    <strong>{profileProjects.length ? "No matching projects" : "No projects assigned"}</strong>
                    <p>{profileProjects.length ? "Adjust the filters to see more project assignments." : "Project assignments will appear here once added."}</p>
                  </div>
                </div>
              )}
            </section>
          )}

          {activeTab === "payslip" && (
            <section className="fiori-panel">
              <div className="fiori-panel-header">
                <div>
                  <h3>Payslip</h3>
                  <p>Showing {filteredPayslips.length} of {payslips.length} payroll record(s)</p>
                </div>
              </div>
              {renderProfileTabFilters("payslip", {
                searchPlaceholder: "Search period, employee, or status",
                fields: [
                  { key: "status", label: "Status", options: [{ value: "All", label: "All" }, { value: "Published", label: "Published" }, { value: "Draft", label: "Draft" }] },
                  { key: "generatedFrom", label: "Generated From", type: "date" },
                  { key: "generatedTo", label: "Generated To", type: "date" },
                ],
                sortOptions: [
                  { value: "generatedDate", label: "Generated date" },
                  { value: "period", label: "Period" },
                  { value: "status", label: "Status" },
                ],
              })}

              {tabLoading ? (
                <div className="admin-empty-state"><FileText size={24} /><div><strong>Loading payslips</strong><p>Checking payroll records.</p></div></div>
              ) : filteredPayslips.length > 0 ? (
                <div className="fiori-table-shell">
                  <table className="fiori-table">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Employee</th>
                        <th>Status</th>
                        <th>Generated On</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayslips.map((item) => (
                        <tr key={item._id || `${item.employee_id}-${item.period_key}`} className="profile-record-row" onClick={() => openProfileRecord("payslip", item)} tabIndex={0} role="button" onKeyDown={(event) => event.key === "Enter" && openProfileRecord("payslip", item)}>
                          <td><strong>{item.month || item.period_key || "Payroll period"} {item.year || ""}</strong></td>
                          <td>{item.employee_name || profile.name || "Employee"}</td>
                          <td>
                            <span className={`fiori-status-pill ${item.published ? "is-approved" : "is-pending"}`}>
                              {item.published ? "Published" : "Draft"}
                            </span>
                          </td>
                          <td>{formatDate(item.generated_at || item.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="admin-empty-state"><FileText size={24} /><div><strong>{payslips.length ? "No matching payslips" : "No payslips found"}</strong><p>{payslips.length ? "Adjust the filters to see more payroll records." : "Payslip records for this employee will appear here."}</p></div></div>
              )}
            </section>
          )}

          {activeTab === "timesheet" && (
            <section className="fiori-panel">
              <div className="fiori-panel-header">
                <div>
                  <h3>Timesheet</h3>
                  <p>Showing {filteredTimesheets.length} of {timesheets.length} timesheet period(s)</p>
                </div>
              </div>
              {renderProfileTabFilters("timesheet", {
                searchPlaceholder: "Search period, status, hours, or entries",
                fields: [
                  { key: "status", label: "Status", options: uniqueOptions(timesheets, (item) => item.status || "draft") },
                  { key: "periodFrom", label: "Period From", type: "date" },
                  { key: "periodTo", label: "Period To", type: "date" },
                ],
                sortOptions: [
                  { value: "periodStart", label: "Period start" },
                  { value: "status", label: "Status" },
                  { value: "hours", label: "Total hours" },
                  { value: "entries", label: "Entries" },
                ],
              })}

              {tabLoading ? (
                <div className="admin-empty-state"><Clock size={24} /><div><strong>Loading timesheets</strong><p>Checking timesheet records.</p></div></div>
              ) : filteredTimesheets.length > 0 ? (
                <div className="fiori-table-shell">
                  <table className="fiori-table">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Status</th>
                        <th>Total Hours</th>
                        <th>Entries</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTimesheets.map((item) => (
                        <tr key={item._id} className="profile-record-row" onClick={() => openProfileRecord("timesheet", item)} tabIndex={0} role="button" onKeyDown={(event) => event.key === "Enter" && openProfileRecord("timesheet", item)}>
                          <td>{formatDateRange(item.period_start, item.period_end)}</td>
                          <td>
                            <span className={`fiori-status-pill ${item.status === "approved" ? "is-approved" : "is-pending"}`}>
                              {item.status || "Draft"}
                            </span>
                          </td>
                          <td>{getTimesheetHours(item)} hour(s)</td>
                          <td>{item.entries?.length || 0} record(s)</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="admin-empty-state"><Clock size={24} /><div><strong>{timesheets.length ? "No matching timesheets" : "No timesheets found"}</strong><p>{timesheets.length ? "Adjust the filters to see more timesheet records." : "Timesheet records for this employee will appear here."}</p></div></div>
              )}
            </section>
          )}

          {activeTab === "leaves" && (
            <div className="profile-layout">
              <div className="profile-main">
                <section className="fiori-panel">
                  <div className="fiori-panel-header">
                    <div>
                      <h3>Leaves</h3>
                      <p>Showing {filteredLeaves.length} of {leaveHistory.length} leave record(s)</p>
                    </div>
                  </div>
                  {renderProfileTabFilters("leaves", {
                    searchPlaceholder: "Search leave type, status, period, or days",
                    fields: [
                      { key: "status", label: "Status", options: uniqueOptions(leaveHistory, (item) => item.status || "Pending") },
                      { key: "type", label: "Leave Type", options: leaveTypeOptions },
                      { key: "startFrom", label: "Start From", type: "date" },
                      { key: "startTo", label: "Start To", type: "date" },
                    ],
                    sortOptions: [
                      { value: "startDate", label: "Start date" },
                      { value: "type", label: "Leave type" },
                      { value: "status", label: "Status" },
                      { value: "days", label: "Days" },
                    ],
                  })}

                  {tabLoading ? (
                    <div className="admin-empty-state"><CalendarDays size={24} /><div><strong>Loading leaves</strong><p>Checking leave records.</p></div></div>
                  ) : filteredLeaves.length > 0 ? (
                    <div className="fiori-table-shell">
                      <table className="fiori-table">
                        <thead>
                          <tr>
                            <th>Leave Type</th>
                            <th>Period</th>
                            <th>Days</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLeaves.map((item) => (
                            <tr key={item._id} className="profile-record-row" onClick={() => openProfileRecord("leave", item)} tabIndex={0} role="button" onKeyDown={(event) => event.key === "Enter" && openProfileRecord("leave", item)}>
                              <td><strong>{item.leave_type || item.leaveType || "Leave"}</strong></td>
                              <td>{formatDateRange(item.start_date, item.end_date)}</td>
                              <td>{item.approved_days || item.days || 0}</td>
                              <td>
                                <span className={`fiori-status-pill ${item.status === "Approved" ? "is-approved" : item.status === "Rejected" ? "is-rejected" : "is-pending"}`}>
                                  {item.status || "Pending"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="admin-empty-state"><CalendarDays size={24} /><div><strong>{leaveHistory.length ? "No matching leave records" : "No leave records found"}</strong><p>{leaveHistory.length ? "Adjust the filters to see more leave records." : "Leave requests for this employee will appear here."}</p></div></div>
                  )}
                </section>
              </div>

              <aside className="profile-side">
                <section className="fiori-panel">
                  <div className="fiori-panel-header">
                    <div>
                      <h3>Leave balance</h3>
                      <p>Current available leave categories</p>
                    </div>
                  </div>

                  {profile.leaveBalance ? (
                    <div className="profile-balance-grid">
                      <div className="profile-balance-card"><span>Sick</span><strong>{profile.leaveBalance.sick || 0}</strong></div>
                      <div className="profile-balance-card"><span>Planned</span><strong>{profile.leaveBalance.planned || 0}</strong></div>
                      <div className="profile-balance-card"><span>Optional</span><strong>{profile.leaveBalance.optional || 0}</strong></div>
                      <div className="profile-balance-card"><span>LWP</span><strong>{profile.leaveBalance.lwp || 0}</strong></div>
                    </div>
                  ) : (
                    <div className="admin-empty-state"><CalendarDays size={24} /><div><strong>No leave balance data</strong><p>Leave balance information is not available for this user.</p></div></div>
                  )}
                </section>
              </aside>
            </div>
          )}

          {tabMessage && (
            <div className="admin-toast is-error" style={{ position: "static", maxWidth: "100%" }}>
              {tabMessage}
            </div>
          )}

          {selectedProfileRecord ? (
            <div className="profile-record-overlay" role="presentation">
              <section className="profile-record-detail" role="dialog" aria-modal="true" aria-label={`${selectedProfileRecord.type} details`}>
                <button type="button" className="fiori-button secondary" onClick={() => setSelectedProfileRecord(null)}><ArrowLeft size={16} /> Back to profile</button>
                <h3>{selectedProfileRecord.type === "timesheet" ? "Timesheet details" : selectedProfileRecord.type === "payslip" ? "Payslip details" : selectedProfileRecord.type === "project" ? "Project details" : "Leave request details"}</h3>
                {selectedProfileRecord.type === "timesheet" ? (
                  <div className="profile-record-detail-grid">
                    <span>Period</span><strong>{formatDateRange(selectedProfileRecord.record.period_start, selectedProfileRecord.record.period_end)}</strong>
                    <span>Status</span><strong>{selectedProfileRecord.record.status || "Draft"}</strong>
                    <span>Total hours</span><strong>{getTimesheetHours(selectedProfileRecord.record)} hour(s)</strong>
                    <span>Entries</span><strong>{selectedProfileRecord.record.entries?.length || 0}</strong>
                  </div>
                ) : selectedProfileRecord.type === "payslip" ? (
                  <div className="profile-record-detail-grid">
                    <span>Period</span><strong>{selectedProfileRecord.record.month || selectedProfileRecord.record.period_key || "Payroll period"} {selectedProfileRecord.record.year || ""}</strong>
                    <span>Status</span><strong>{selectedProfileRecord.record.published ? "Published" : "Draft"}</strong>
                    <span>Generated</span><strong>{formatDate(selectedProfileRecord.record.generated_at || selectedProfileRecord.record.created_at)}</strong>
                    <span>Employee</span><strong>{selectedProfileRecord.record.employee_name || profile.name}</strong>
                  </div>
                ) : selectedProfileRecord.type === "project" ? (
                  <div className="profile-record-detail-grid">
                    <span>Project</span><strong>{selectedProfileRecord.record.projectName || selectedProfileRecord.record.name || "Project"}</strong>
                    <span>Project ID</span><strong>{selectedProfileRecord.record.projectId || "—"}</strong>
                    <span>Start date</span><strong>{formatDate(selectedProfileRecord.record.startDate)}</strong>
                    <span>End date</span><strong>{formatDate(selectedProfileRecord.record.endDate)}</strong>
                  </div>
                ) : (
                  <div className="profile-record-detail-grid">
                    <span>Leave type</span><strong>{selectedProfileRecord.record.leave_type || selectedProfileRecord.record.leaveType || "Leave"}</strong>
                    <span>Period</span><strong>{formatDateRange(selectedProfileRecord.record.start_date, selectedProfileRecord.record.end_date)}</strong>
                    <span>Status</span><strong>{selectedProfileRecord.record.status || "Pending"}</strong>
                    <span>Days</span><strong>{selectedProfileRecord.record.approved_days || selectedProfileRecord.record.days || 0}</strong>
                    <span>Reason</span><strong>{selectedProfileRecord.record.reason || "No reason provided"}</strong>
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </>
      )}

      {profile && isEditing && (
        <section className="fiori-panel">
          <div className="fiori-panel-header">
            <div>
              <h3>Edit profile</h3>
              <p>Update employee profile details and reporting information</p>
            </div>
          </div>

          <div className="profile-edit-grid">
            {[
              ["name", "Full Name *", "text", "Full name"],
              ["email", "Email *", "email", "Email"],
              ["designation", "Designation *", "text", "Designation"],
              ["department", "Department", "text", "Department"],
              ["shiftTimings", "Shift Timings", "text", "e.g. 9:00 AM - 6:00 PM"],
              ["dateOfJoining", "Date of Joining", "date", ""],
              ["dateOfBirth", "Date of Birth", "date", ""],
              ["workLocation", "Work Location", "text", "e.g. Hyderabad Office"],
              ["companyCode", "Company Code", "text", "Assigned by admin"],
              ["costCenter", "Cost Center", "text", "Assigned by admin"],
            ].map(([field, label, type, placeholder]) => (
              <label key={field} className="profile-edit-field">
                <span>{label}</span>
                <input
                  className="input"
                  type={type}
                  value={editForm[field] || ""}
                  onChange={(event) => handleInputChange(field, event.target.value)}
                  placeholder={placeholder}
                  max={field === "dateOfBirth" ? new Date().toISOString().split("T")[0] : undefined}
                />
              </label>
            ))}

            {role === "Admin" && (
              <>
                <label className="profile-edit-field">
                  <span>People Lead / HR Manager Email</span>
                  <input
                    className="input"
                    type="email"
                    value={editForm.peopleLeadEmail || ""}
                    onChange={(event) => handleInputChange("peopleLeadEmail", event.target.value)}
                    placeholder="hr@example.com"
                  />
                </label>

                <label className="profile-edit-field">
                  <span>Manager Email (Reports To)</span>
                  <input
                    className="input"
                    type="email"
                    value={editForm.reportsToEmail || ""}
                    onChange={(event) => handleInputChange("reportsToEmail", event.target.value)}
                    placeholder="manager@example.com"
                  />
                </label>
              </>
            )}
          </div>

          <div className="admin-modal-actions">
            <button className="fiori-button secondary" onClick={handleCancel} disabled={loading}>
              Cancel
            </button>
            <button
              className="fiori-button primary"
              onClick={handleSave}
              disabled={loading || !editForm.name || !editForm.email || !editForm.designation}
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </section>
      )}

      {showPasswordModal && (
        <div
          className="admin-modal-overlay"
          onClick={() => {
            setShowPasswordModal(false);
            setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
            setPasswordError("");
          }}
        >
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <div className="admin-section-overline">Security</div>
                <h2>Change Password</h2>
                <p>
                  {role === "Admin" && !isOwnProfile
                    ? `Set a new password for ${profile?.name}`
                    : "Enter your current password and choose a new one"}
                </p>
              </div>
            </div>

            <div className="profile-modal-stack">
              {isOwnProfile && (
                <label className="profile-edit-field">
                  <span>Current Password *</span>
                  <input
                    className="input"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(event) =>
                      setPasswordForm((previous) => ({
                        ...previous,
                        currentPassword: event.target.value,
                      }))
                    }
                  />
                </label>
              )}

              <label className="profile-edit-field">
                <span>New Password *</span>
                <input
                  className="input"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) =>
                    setPasswordForm((previous) => ({
                      ...previous,
                      newPassword: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="profile-edit-field">
                <span>Confirm New Password *</span>
                <input
                  className="input"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((previous) => ({
                      ...previous,
                      confirmPassword: event.target.value,
                    }))
                  }
                />
              </label>

              {passwordError && (
                <div className="admin-toast is-error" style={{ position: "static", maxWidth: "100%" }}>
                  {passwordError}
                </div>
              )}
            </div>

            <div className="admin-modal-actions">
              <button
                className="fiori-button secondary"
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
                  setPasswordError("");
                }}
              >
                Cancel
              </button>
              <button
                className="fiori-button primary"
                onClick={handlePasswordChange}
                disabled={
                  loading ||
                  !passwordForm.newPassword ||
                  !passwordForm.confirmPassword ||
                  (isOwnProfile && !passwordForm.currentPassword)
                }
              >
                {loading ? "Changing..." : "Change Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showProjectModal && (
        <div className="admin-modal-overlay" onClick={() => setShowProjectModal(false)}>
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <div className="admin-section-overline">Project Assignment</div>
                <h2>{projectForm._id ? "Edit Project Assignment" : "Assign Project"}</h2>
              </div>
            </div>

            <div className="profile-modal-stack">
              {!projectForm._id ? (
                <label className="profile-edit-field">
                  <span>Select Project *</span>
                  <select
                    className="input"
                    value={selectedProjectId}
                    onChange={(event) => {
                      setSelectedProjectId(event.target.value);
                      const selected = availableProjects.find((project) => project._id === event.target.value);
                      if (selected) {
                        setProjectForm((previous) => ({
                          ...previous,
                          name: selected.title,
                          projectId: selected._id,
                        }));
                      }
                    }}
                  >
                    <option value="">Select a project</option>
                    {availableProjects.map((project) => (
                      <option key={project._id} value={project._id}>
                        {project.projectId} - {project.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="profile-edit-field">
                  <span>Project Name</span>
                  <input className="input" value={projectForm.name} disabled />
                </label>
              )}

              <label className="profile-edit-field">
                <span>Start Date *</span>
                <input
                  className="input"
                  type="date"
                  value={projectForm.startDate}
                  onChange={(event) =>
                    setProjectForm((previous) => ({ ...previous, startDate: event.target.value }))
                  }
                />
              </label>

              <label className="profile-edit-field">
                <span>End Date</span>
                <input
                  className="input"
                  type="date"
                  value={projectForm.endDate}
                  onChange={(event) =>
                    setProjectForm((previous) => ({ ...previous, endDate: event.target.value }))
                  }
                  min={projectForm.startDate}
                />
              </label>
            </div>

            <div className="admin-modal-actions">
              <button
                className="fiori-button secondary"
                onClick={() => {
                  setShowProjectModal(false);
                  setSelectedProjectId("");
                }}
              >
                Cancel
              </button>
              <button
                className="fiori-button primary"
                onClick={saveProject}
                disabled={!selectedProjectId && !projectForm._id}
              >
                {projectForm._id ? "Update" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`admin-toast ${
            message.toLowerCase().includes("error") || message.toLowerCase().includes("failed")
              ? "is-error"
              : "is-success"
          }`}
        >
          {message}
        </div>
      )}
    </section>
  );
};

export default Profile;
