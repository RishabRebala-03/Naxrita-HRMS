import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Activity,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Filter,
  GitBranch,
  RotateCcw,
  Search,
  ShieldAlert,
  Users,
  Download,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ValueHelpSelect from "./ValueHelpSelect";
import ValueHelpSearch from "./ValueHelpSearch";
import LeaveDetailModal from "./LeaveDetailModal";
import { buildRequesterHeaders } from "../utils/requester";
import { formatDateIST, formatDateTimeIST, toDateKeyIST } from "../utils/dateTime";
import { exportToCSV } from "../utils/csvExport";

const defaultLeaveTypeFilters = ["Sick", "Planned", "Optional", "Compensatory Off", "Early Logout", "LWP"];
const lopAliases = new Set(["lop", "lwp", "leave without pay", "leave with loss of pay"]);
const leaveStatusColors = {
  Approved: "#107e3e",
  Pending: "#f0ab00",
  Cancelled: "#8b95a5",
  Rejected: "#bb0000",
};

const statusToneMap = {
  Approved: "is-approved",
  Rejected: "is-rejected",
  Cancelled: "is-neutral",
  Pending: "is-pending",
};

const formatDate = (value) => {
  return formatDateIST(value);
};

const formatDateTime = (value) => {
  return formatDateTimeIST(value);
};

const shortLabel = (value, max = 12) => {
  if (!value) return "Unassigned";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

const normalizeLeaveTypeFilter = (value) => {
  const normalized = String(value || "").trim();
  return lopAliases.has(normalized.toLowerCase()) ? "LWP" : normalized;
};

const getLeaveTypeDisplayLabel = (value, fallback = "Leave") => {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  return lopAliases.has(normalized.toLowerCase()) ? "LOP" : normalized;
};

const matchesLeaveTypeFilter = (leaveType, selectedType) => {
  if (selectedType === "all") return true;
  return (
    normalizeLeaveTypeFilter(leaveType).toLowerCase() ===
    normalizeLeaveTypeFilter(selectedType).toLowerCase()
  );
};

const dayDiff = (start, end) => {
  const first = new Date(start);
  const second = new Date(end);
  if (Number.isNaN(first.getTime()) || Number.isNaN(second.getTime())) return null;
  return Math.max(0, Math.round((second - first) / (1000 * 60 * 60 * 24)));
};

const toDateKey = (value) => {
  return toDateKeyIST(value);
};

const leaveOverlapsRange = (leave, dateRange) => {
  if (!dateRange.start && !dateRange.end) return true;
  const start = toDateKey(leave.approved_start_date || leave.start_date);
  const end = toDateKey(leave.approved_end_date || leave.end_date) || start;
  if (!start) return false;
  if (dateRange.start && end < dateRange.start) return false;
  if (dateRange.end && start > dateRange.end) return false;
  return true;
};

const buildSuggestions = (items, fields) => {
  const seen = new Set();
  return items.flatMap((item) =>
    fields
      .map((field) => item[field])
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter((value) => {
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((value) => ({ value, label: value }))
  );
};

const getLeaveWindow = (leave) => {
  if (leave.is_partial_approval && leave.approved_start_date && leave.approved_end_date) {
    return `${formatDate(leave.approved_start_date)} to ${formatDate(leave.approved_end_date)}`;
  }

  return `${formatDate(leave.start_date)} to ${formatDate(leave.end_date)}`;
};

const getDaysLabel = (leave) => {
  if (leave.leave_type === "Early Logout") {
    return leave.logout_time ? `Logout at ${leave.logout_time}` : "Early logout";
  }

  const days = leave.approved_days || leave.days || 0;
  return `${days} day${days === 1 ? "" : "s"}`;
};

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const tooltipLabel =
    payload[0]?.payload?.fullName ||
    payload[0]?.payload?.statusLabel ||
    payload[0]?.payload?.monthLabel ||
    payload[0]?.payload?.departmentLabel ||
    payload[0]?.payload?.leaveTypeLabel ||
    label;

  return (
    <div className="fiori-chart-tooltip">
      {tooltipLabel ? <div className="fiori-chart-tooltip-label">{tooltipLabel}</div> : null}
      {payload.map((entry) => (
        <div key={`${entry.name}-${entry.dataKey}`} className="fiori-chart-tooltip-row">
          <span>{entry.name}</span>
          <strong>{entry.value}</strong>
        </div>
      ))}
    </div>
  );
};

const chartAxisTick = { fill: "#5b738b", fontSize: 12 };
const chartAxisLabel = { fill: "#5b738b", fontSize: 12, fontWeight: 600 };

const handleCardKeyDown = (event, action) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
};

const formatMonthKeyLabel = (monthKey) => {
  if (!monthKey) return "";
  const [year, month] = String(monthKey).split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return monthKey;
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

const AdminLeaves = ({ user, navigationState, onNavigateToProfile }) => {
  const [activeTab, setActiveTab] = useState("pending");
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [allLeaves, setAllLeaves] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [sortBy, setSortBy] = useState("newest");
  const [adminPage, setAdminPage] = useState(1);
  const [adminPageSize, setAdminPageSize] = useState(10);
  const [selectedFortnightMonth, setSelectedFortnightMonth] = useState("");
  const [escalationSearch, setEscalationSearch] = useState("");
  const [selectedEscalationOwner, setSelectedEscalationOwner] = useState(null);
  const [rejectModal, setRejectModal] = useState({ show: false, leaveId: null, reason: "" });
  const [selectedLeaveDetails, setSelectedLeaveDetails] = useState(null);
  const [approvalModal, setApprovalModal] = useState({
    show: false,
    leaveId: null,
    approverName: user?.name || user?.email || "",
    originalStart: "",
    originalEnd: "",
    approvedStart: "",
    approvedEnd: "",
  });

  const fetchLeaveWorkspace = async () => {
    try {
      setLoading(true);

      const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

      const [pendingRes, allLeavesRes, usersRes] = await Promise.all([
        axios.get(`${backendUrl}/api/leaves/pending/admin`, {
          headers: buildRequesterHeaders(user),
        }),
        axios.get(`${backendUrl}/api/leaves/all`),
        axios.get(`${backendUrl}/api/users/`, {
          headers: buildRequesterHeaders(user),
        }),
      ]);

      setPendingLeaves(Array.isArray(pendingRes.data) ? pendingRes.data : []);
      setAllLeaves(Array.isArray(allLeavesRes.data) ? allLeavesRes.data : []);
      setAllUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
    } catch (error) {
      setPendingLeaves([]);
      setAllLeaves([]);
      setAllUsers([]);
      setMessage(error.response?.data?.error || "Unable to load leave workspace.");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaveWorkspace();
  }, []);

  const userMap = useMemo(
    () =>
      allUsers.reduce((accumulator, person) => {
        if (person?._id) {
          accumulator[person._id] = person;
        }
        return accumulator;
      }, {}),
    [allUsers]
  );

  const openEmployeeProfile = (leave) => {
    const employeeId = String(leave?.employee_id || "").trim();
    if (!employeeId || !onNavigateToProfile) return;
    onNavigateToProfile(employeeId);
  };

  const summaryMetrics = useMemo(() => {
    const totalRequests = allLeaves.length;
    const approved = allLeaves.filter((leave) => leave.status === "Approved").length;
    const rejected = allLeaves.filter((leave) => leave.status === "Rejected").length;
    const escalated = allLeaves.filter(
      (leave) => Array.isArray(leave.escalation_history) && leave.escalation_history.length > 0
    ).length;

    const openOverdue = allLeaves.filter((leave) => {
      if (leave.status !== "Pending") return false;
      const referenceDate = leave.escalated_on || leave.applied_on;
      const pendingDays = dayDiff(referenceDate, new Date());
      const threshold = (leave.escalation_level || 0) > 0 ? 1 : 2;
      return pendingDays !== null && pendingDays >= threshold;
    }).length;

    return {
      totalRequests,
      approved,
      rejected,
      escalated,
      pending: pendingLeaves.length,
      approvalRate: totalRequests ? Math.round((approved / totalRequests) * 100) : 0,
      openOverdue,
    };
  }, [allLeaves, pendingLeaves]);

  const availableDepartments = useMemo(() => {
    const values = new Set(
      allLeaves.map((leave) => leave.employee_department).filter(Boolean)
    );
    return ["all", ...Array.from(values).sort((first, second) => first.localeCompare(second))];
  }, [allLeaves]);

  const availableTypes = useMemo(() => {
    const values = new Set(defaultLeaveTypeFilters);
    allLeaves.forEach((leave) => {
      const type = normalizeLeaveTypeFilter(leave.leave_type);
      if (type) values.add(type);
    });
    return [
      "all",
      ...Array.from(values).sort((first, second) =>
        getLeaveTypeDisplayLabel(first).localeCompare(getLeaveTypeDisplayLabel(second))
      ),
    ];
  }, [allLeaves]);

  const filteredLeaves = useMemo(() => {
    const source = activeTab === "pending" ? pendingLeaves : allLeaves;
    const query = searchTerm.trim().toLowerCase();

    return [...source]
      .filter((leave) => {
        if (
          query &&
          ![
            leave.employee_name,
            leave.employee_email,
            leave.employee_designation,
            leave.employee_department,
            leave.leave_type,
            getLeaveTypeDisplayLabel(leave.leave_type),
            leave.approved_by,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query))
        ) {
          return false;
        }

        if (statusFilter !== "all" && leave.status !== statusFilter) return false;
        if (departmentFilter !== "all" && leave.employee_department !== departmentFilter) return false;
        if (!matchesLeaveTypeFilter(leave.leave_type, typeFilter)) return false;
        if (!leaveOverlapsRange(leave, dateRange)) return false;

        return true;
      })
      .sort((first, second) => {
        switch (sortBy) {
          case "oldest":
            return new Date(first.applied_on) - new Date(second.applied_on);
          case "name":
            return (first.employee_name || "").localeCompare(second.employee_name || "");
          case "department":
            return (first.employee_department || "").localeCompare(second.employee_department || "");
          case "status":
            return (first.status || "").localeCompare(second.status || "");
          case "newest":
          default:
            return new Date(second.applied_on) - new Date(first.applied_on);
        }
      });
  }, [activeTab, allLeaves, dateRange, departmentFilter, pendingLeaves, searchTerm, sortBy, statusFilter, typeFilter]);

  useEffect(() => {
    setAdminPage(1);
  }, [activeTab, dateRange, departmentFilter, searchTerm, sortBy, statusFilter, typeFilter]);

  const adminPageCount = Math.max(1, Math.ceil(filteredLeaves.length / adminPageSize));
  const visibleLeaves = useMemo(() => {
    const start = (adminPage - 1) * adminPageSize;
    return filteredLeaves.slice(start, start + adminPageSize);
  }, [filteredLeaves, adminPage, adminPageSize]);

  const hasActiveFilters = useMemo(() => {
    return Boolean(
      searchTerm.trim() !== "" ||
      statusFilter !== "all" ||
      departmentFilter !== "all" ||
      typeFilter !== "all" ||
      dateRange.start !== "" ||
      dateRange.end !== "" ||
      sortBy !== "newest"
    );
  }, [searchTerm, statusFilter, departmentFilter, typeFilter, dateRange, sortBy]);

  const handleClearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setDepartmentFilter("all");
    setTypeFilter("all");
    setDateRange({ start: "", end: "" });
    setSortBy("newest");
  };

  const handleExportLeaves = () => {
    if (!filteredLeaves.length) {
      alert("No leave records available to export for the current filters.");
      return;
    }

    const headers = [
      { label: "Employee Name", key: (l) => l.employee_name || "Unknown employee" },
      { label: "Email", key: (l) => l.employee_email || "" },
      { label: "Designation", key: (l) => l.employee_designation || "" },
      { label: "Department", key: (l) => l.employee_department || "" },
      { label: "Leave Type", key: (l) => getLeaveTypeDisplayLabel(l.leave_type) },
      { label: "Days", key: (l) => l.approved_days || l.days || 0 },
      { label: "Start Date", key: (l) => formatDate(l.approved_start_date || l.start_date) },
      { label: "End Date", key: (l) => formatDate(l.approved_end_date || l.end_date) },
      { label: "Status", key: (l) => l.status || "Pending" },
      { label: "Current Approver", key: (l) => userMap[l.current_approver_id]?.name || "Administration queue" },
      { label: "Approved By", key: (l) => l.approved_by || "" },
      { label: "Applied On", key: (l) => formatDateTime(l.applied_on) },
      { label: "Reason", key: (l) => l.reason || "" },
      { label: "Rejection Reason", key: (l) => l.rejection_reason || "" },
    ];

    const fileName = `${activeTab === "pending" ? "Pending_Leave_Requests" : "Leave_Records"}_${new Date().toISOString().slice(0, 10)}.csv`;
    exportToCSV(fileName, headers, filteredLeaves);
  };

  const searchSuggestions = useMemo(
    () =>
      buildSuggestions(activeTab === "pending" ? pendingLeaves : allLeaves, [
        "employee_name",
        "employee_email",
        "employee_designation",
        "employee_department",
        "leave_type",
        "approved_by",
      ]),
    [activeTab, allLeaves, pendingLeaves]
  );

  const leaveStatusData = useMemo(() => {
    const orderedStatuses = ["Approved", "Pending", "Cancelled", "Rejected"];
    const counts = allLeaves.reduce((accumulator, leave) => {
      const key = leave.status || "Pending";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

    return orderedStatuses.map((status) => ({
      statusLabel: status,
      statusCount: counts[status] || 0,
      color: leaveStatusColors[status],
    }));
  }, [allLeaves]);

  const leaveTypeData = useMemo(() => {
    const counts = allLeaves.reduce((accumulator, leave) => {
      const key = leave.leave_type ? getLeaveTypeDisplayLabel(leave.leave_type) : "Other";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

    return Object.entries(counts)
      .map(([name, value]) => ({
        leaveTypeLabel: shortLabel(name, 14),
        fullName: name,
        requestCount: value,
      }))
      .sort((first, second) => second.requestCount - first.requestCount);
  }, [allLeaves]);

  const departmentLoadData = useMemo(() => {
    const counts = allLeaves.reduce((accumulator, leave) => {
      const key = leave.employee_department || "Unassigned";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

    return Object.entries(counts)
      .map(([name, value]) => ({
        departmentLabel: shortLabel(name, 14),
        fullName: name,
        requestCount: value,
      }))
      .sort((first, second) => second.requestCount - first.requestCount)
      .slice(0, 8);
  }, [allLeaves]);

  const monthlyTrendData = useMemo(() => {
    const buckets = [];
    const today = new Date();

    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date(today.getFullYear(), today.getMonth() - index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      buckets.push({
        key,
        monthLabel: date.toLocaleDateString("en-IN", { month: "short" }),
        requests: 0,
        approved: 0,
        rejected: 0,
      });
    }

    const bucketMap = buckets.reduce((accumulator, bucket) => {
      accumulator[bucket.key] = bucket;
      return accumulator;
    }, {});

    allLeaves.forEach((leave) => {
      const applied = new Date(leave.applied_on || leave.start_date);
      if (!Number.isNaN(applied.getTime())) {
        const key = `${applied.getFullYear()}-${String(applied.getMonth() + 1).padStart(2, "0")}`;
        if (bucketMap[key]) bucketMap[key].requests += 1;
      }

      const approved = new Date(leave.approved_on || "");
      if (!Number.isNaN(approved.getTime()) && leave.status === "Approved") {
        const key = `${approved.getFullYear()}-${String(approved.getMonth() + 1).padStart(2, "0")}`;
        if (bucketMap[key]) bucketMap[key].approved += 1;
      }

      const rejected = new Date(leave.rejected_on || "");
      if (!Number.isNaN(rejected.getTime()) && leave.status === "Rejected") {
        const key = `${rejected.getFullYear()}-${String(rejected.getMonth() + 1).padStart(2, "0")}`;
        if (bucketMap[key]) bucketMap[key].rejected += 1;
      }
    });

    return buckets;
  }, [allLeaves]);

  const availableAnalyticsMonths = useMemo(() => {
    const monthKeys = new Set();

    allLeaves.forEach((leave) => {
      const referenceDate = new Date(leave.applied_on || leave.start_date || "");
      if (Number.isNaN(referenceDate.getTime())) return;
      monthKeys.add(
        `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}`
      );
    });

    return Array.from(monthKeys)
      .sort((first, second) => second.localeCompare(first))
      .map((monthKey) => ({
        value: monthKey,
        label: formatMonthKeyLabel(monthKey),
      }));
  }, [allLeaves]);

  useEffect(() => {
    if (!availableAnalyticsMonths.length) {
      if (selectedFortnightMonth) setSelectedFortnightMonth("");
      return;
    }

    const hasSelection = availableAnalyticsMonths.some((option) => option.value === selectedFortnightMonth);
    if (!hasSelection) {
      setSelectedFortnightMonth(availableAnalyticsMonths[0].value);
    }
  }, [availableAnalyticsMonths, selectedFortnightMonth]);

  const fortnightStatusData = useMemo(() => {
    const selectedMonth = selectedFortnightMonth || availableAnalyticsMonths[0]?.value || "";
    const initialBuckets = [
      { fortnightLabel: "First Half", approvedCount: 0, pendingCount: 0, windowLabel: "1 - 15" },
      { fortnightLabel: "Second Half", approvedCount: 0, pendingCount: 0, windowLabel: "16 - End" },
    ];

    if (!selectedMonth) return initialBuckets;

    allLeaves.forEach((leave) => {
      if (!["Approved", "Pending"].includes(leave.status)) return;

      const referenceDate = new Date(leave.applied_on || leave.start_date || "");
      if (Number.isNaN(referenceDate.getTime())) return;

      const monthKey = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}`;
      if (monthKey !== selectedMonth) return;

      const bucketIndex = referenceDate.getDate() <= 15 ? 0 : 1;
      if (leave.status === "Approved") {
        initialBuckets[bucketIndex].approvedCount += 1;
      }
      if (leave.status === "Pending") {
        initialBuckets[bucketIndex].pendingCount += 1;
      }
    });

    return initialBuckets;
  }, [allLeaves, availableAnalyticsMonths, selectedFortnightMonth]);

  const escalationEvents = useMemo(() => {
    return allLeaves.flatMap((leave) => {
      const history = Array.isArray(leave.escalation_history) ? leave.escalation_history : [];
      return history.map((entry, index) => {
        const employeeRecord = userMap[leave.employee_id];
        const offenderId =
          entry.from_approver || (index === 0 ? employeeRecord?.reportsTo || null : null);
        const offender = offenderId ? userMap[offenderId] : null;
        const escalatedToId = entry.to_approver || entry.approver_id || null;
        const escalatedTo = escalatedToId ? userMap[escalatedToId] : null;

        return {
          key: `${leave._id}-${index}`,
          leaveId: leave._id,
          employeeId: leave.employee_id,
          employeeName: leave.employee_name || "Unknown employee",
          employeeDepartment: leave.employee_department || "Unassigned",
          leaveType: getLeaveTypeDisplayLabel(leave.leave_type),
          requestedFrom: leave.start_date,
          requestedTo: leave.end_date,
          appliedOn: leave.applied_on,
          escalatedAt: entry.escalated_at,
          escalationLevel: entry.to_level || entry.level || leave.escalation_level || 1,
          status: leave.status || "Pending",
          offenderId,
          offenderName: offender?.name || "Unresolved approver",
          offenderEmail: offender?.email || "",
          offenderRole: offender?.role || "",
          escalatedToName:
            entry.to_approver_name || escalatedTo?.name || (escalatedTo ? escalatedTo.email : "Unknown"),
          reason: entry.reason || "Approval SLA exceeded",
        };
      });
    });
  }, [allLeaves, userMap]);

  const escalationMonthlyData = useMemo(() => {
    const buckets = [];
    const today = new Date();

    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date(today.getFullYear(), today.getMonth() - index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      buckets.push({
        key,
        name: date.toLocaleDateString("en-IN", { month: "short" }),
        escalations: 0,
      });
    }

    const bucketMap = buckets.reduce((accumulator, bucket) => {
      accumulator[bucket.key] = bucket;
      return accumulator;
    }, {});

    escalationEvents.forEach((event) => {
      const escalatedAt = new Date(event.escalatedAt);
      if (Number.isNaN(escalatedAt.getTime())) return;

      const key = `${escalatedAt.getFullYear()}-${String(escalatedAt.getMonth() + 1).padStart(2, "0")}`;
      if (bucketMap[key]) bucketMap[key].escalations += 1;
    });

    return buckets;
  }, [escalationEvents]);

  const resolutionTurnaroundData = useMemo(() => {
    const grouped = {};

    allLeaves.forEach((leave) => {
      if (!["Approved", "Rejected"].includes(leave.status)) return;

      const appliedOn = new Date(leave.applied_on);
      const resolvedOn = new Date(leave.approved_on || leave.rejected_on || "");
      if (Number.isNaN(appliedOn.getTime()) || Number.isNaN(resolvedOn.getTime())) return;

      const key = leave.leave_type ? getLeaveTypeDisplayLabel(leave.leave_type) : "Other";
      grouped[key] = grouped[key] || { totalDays: 0, count: 0 };
      grouped[key].totalDays += Math.max(0, (resolvedOn - appliedOn) / (1000 * 60 * 60 * 24));
      grouped[key].count += 1;
    });

    return Object.entries(grouped)
      .map(([name, bucket]) => ({
        leaveTypeLabel: shortLabel(name, 14),
        fullName: name,
        averageDays: Number((bucket.totalDays / bucket.count).toFixed(1)),
      }))
      .sort((first, second) => second.averageDays - first.averageDays);
  }, [allLeaves]);

  const escalationOwners = useMemo(() => {
    const grouped = escalationEvents.reduce((accumulator, event) => {
      const key = event.offenderId || event.offenderName;
      if (!accumulator[key]) {
        accumulator[key] = {
          id: key,
          approverId: event.offenderId,
          name: event.offenderName,
          email: event.offenderEmail,
          role: event.offenderRole,
          count: 0,
          pendingCount: 0,
          employees: new Set(),
          departments: new Set(),
          latestEscalation: null,
          events: [],
        };
      }

      accumulator[key].count += 1;
      if (event.status === "Pending") {
        accumulator[key].pendingCount += 1;
      }
      accumulator[key].employees.add(event.employeeName);
      accumulator[key].departments.add(event.employeeDepartment);
      accumulator[key].events.push(event);

      const latest = accumulator[key].latestEscalation
        ? new Date(accumulator[key].latestEscalation)
        : null;
      const current = new Date(event.escalatedAt || 0);
      if (!latest || current > latest) {
        accumulator[key].latestEscalation = event.escalatedAt;
      }

      return accumulator;
    }, {});

    return Object.values(grouped)
      .map((entry) => ({
        ...entry,
        employeesAffected: entry.employees.size,
        departmentCount: entry.departments.size,
        departments: Array.from(entry.departments),
        events: entry.events.sort((first, second) => new Date(second.escalatedAt) - new Date(first.escalatedAt)),
      }))
      .filter((entry) => {
        if (!escalationSearch.trim()) return true;
        const query = escalationSearch.toLowerCase();
        return [entry.name, entry.email, ...entry.departments]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .sort((first, second) => {
        if (second.count !== first.count) return second.count - first.count;
        return new Date(second.latestEscalation || 0) - new Date(first.latestEscalation || 0);
      });
  }, [escalationEvents, escalationSearch]);

  const openApproveModal = (leave) => {
    setApprovalModal({
      show: true,
      leaveId: leave._id,
      approverName: user?.name || user?.email || "",
      originalStart: leave.start_date,
      originalEnd: leave.end_date,
      approvedStart: leave.start_date,
      approvedEnd: leave.end_date,
    });
  };

  const openTab = (tab, options = {}) => {
    setActiveTab(tab);

    if (Object.prototype.hasOwnProperty.call(options, "statusFilter")) {
      setStatusFilter(options.statusFilter);
    }
    if (Object.prototype.hasOwnProperty.call(options, "typeFilter")) {
      setTypeFilter(options.typeFilter);
    }
    if (Object.prototype.hasOwnProperty.call(options, "departmentFilter")) {
      setDepartmentFilter(options.departmentFilter);
    }
    if (Object.prototype.hasOwnProperty.call(options, "searchTerm")) {
      setSearchTerm(options.searchTerm);
    }
  };

  useEffect(() => {
    if (!navigationState) return;

    if (navigationState.activeTab) {
      openTab(navigationState.activeTab);
    }
  }, [navigationState]);

  useEffect(() => {
    const leaveId = navigationState?.leaveId;
    if (!leaveId) return;
    const target = document.getElementById(`admin-leave-${leaveId}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [allLeaves, navigationState, pendingLeaves]);

  const updateStatus = async ({
    leaveId,
    status,
    rejectionReason = "",
    approverName = "",
    approvedStart = null,
    approvedEnd = null,
  }) => {
    try {
      const payload = { status };

      if (status === "Rejected") {
        payload.rejection_reason = rejectionReason;
      }

      if (status === "Approved") {
        payload.approved_by = approverName.trim();

        const isPartial =
          approvedStart &&
          approvedEnd &&
          (approvedStart !== approvalModal.originalStart || approvedEnd !== approvalModal.originalEnd);

        if (isPartial) {
          payload.is_partial = true;
          payload.approved_start_date = approvedStart;
          payload.approved_end_date = approvedEnd;
        }
      }

      const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
      const response = await axios.put(
        `${backendUrl}/api/leaves/update_status/${leaveId}`,
        payload,
        { headers: buildRequesterHeaders(user) }
      );

      setMessage(response.data?.message || `Leave ${status.toLowerCase()} successfully.`);
      setRejectModal({ show: false, leaveId: null, reason: "" });
      setApprovalModal({
        show: false,
        leaveId: null,
        approverName: user?.name || user?.email || "",
        originalStart: "",
        originalEnd: "",
        approvedStart: "",
        approvedEnd: "",
      });
      fetchLeaveWorkspace();
      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      setMessage(error.response?.data?.error || "Unable to update leave status.");
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const confirmReject = async () => {
    if (!rejectModal.reason.trim()) {
      setMessage("A rejection reason is required.");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    await updateStatus({
      leaveId: rejectModal.leaveId,
      status: "Rejected",
      rejectionReason: rejectModal.reason,
    });
  };

  const confirmApprove = async () => {
    if (!approvalModal.approverName.trim()) {
      setMessage("Approver name is required.");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    await updateStatus({
      leaveId: approvalModal.leaveId,
      status: "Approved",
      approverName: approvalModal.approverName,
      approvedStart: approvalModal.approvedStart,
      approvedEnd: approvalModal.approvedEnd,
    });
  };

  if (loading) {
    return (
      <section className="leave-workspace">
        <div className="fiori-loading-card">
          <Clock3 size={28} />
          <div>
            <strong>Loading leave workspace</strong>
            <p>Preparing approvals, records, analytics, and escalation history.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="leave-workspace">
      <header className="admin-hero">
        <div className="admin-hero-copy">
          <div className="admin-section-overline">Leave Operations</div>
          <h1>Leave management</h1>
          <p>
            Handle requests, review employee context, and move through approvals without the page feeling overloaded.
          </p>
        </div>

        <div className="admin-hero-meta">
          <div className="admin-hero-meta-item">
            <span>Primary View</span>
            <strong>Approvals and records</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Built For</span>
            <strong>Fast admin review</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Outcome</span>
            <strong>Clear leave decisions</strong>
          </div>
        </div>
      </header>

      <div className="admin-dashboard-grid">
        <article
          className="fiori-stat-card is-actionable"
          onClick={() => openTab("pending", { statusFilter: "all", typeFilter: "all", departmentFilter: "all", searchTerm: "" })}
          onKeyDown={(event) =>
            handleCardKeyDown(event, () =>
              openTab("pending", { statusFilter: "all", typeFilter: "all", departmentFilter: "all", searchTerm: "" })
            )
          }
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Admin queue</span>
            <Clock3 size={18} />
          </div>
          <div className="fiori-stat-value">{summaryMetrics.pending}</div>
          <div className="fiori-stat-note">Leave requests waiting for administration action</div>
        </article>

        <article
          className="fiori-stat-card is-actionable"
          onClick={() => openTab("records", { statusFilter: "all", typeFilter: "all", departmentFilter: "all", searchTerm: "" })}
          onKeyDown={(event) =>
            handleCardKeyDown(event, () =>
              openTab("records", { statusFilter: "all", typeFilter: "all", departmentFilter: "all", searchTerm: "" })
            )
          }
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Total requests</span>
            <CalendarClock size={18} />
          </div>
          <div className="fiori-stat-value">{summaryMetrics.totalRequests}</div>
          <div className="fiori-stat-note">All leave records currently maintained in the system</div>
        </article>

        <article
          className="fiori-stat-card is-actionable"
          onClick={() => openTab("records", { statusFilter: "Approved", typeFilter: "all", departmentFilter: "all", searchTerm: "" })}
          onKeyDown={(event) =>
            handleCardKeyDown(event, () =>
              openTab("records", { statusFilter: "Approved", typeFilter: "all", departmentFilter: "all", searchTerm: "" })
            )
          }
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Resolved requests</span>
            <CheckCircle2 size={18} />
          </div>
          <div className="fiori-stat-value">{summaryMetrics.approved + summaryMetrics.rejected}</div>
          <div className="fiori-stat-note">Approved and rejected requests already closed out</div>
        </article>

        <article
          className="fiori-stat-card is-actionable"
          onClick={() => openTab("escalations")}
          onKeyDown={(event) => handleCardKeyDown(event, () => openTab("escalations"))}
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Open SLA breaches</span>
            <ShieldAlert size={18} />
          </div>
          <div className="fiori-stat-value">{summaryMetrics.openOverdue}</div>
          <div className="fiori-stat-note">Pending requests currently beyond configured SLA</div>
        </article>
      </div>

      <section className="fiori-panel">
        <div className="leave-tab-strip" role="tablist" aria-label="Leave workspace tabs">
          {[
            { id: "pending", label: `Pending Approvals (${pendingLeaves.length})` },
            { id: "records", label: `All Records (${allLeaves.length})` },
            { id: "analytics", label: "Leave Analytics" },
            { id: "escalations", label: `Leave Escalations (${escalationEvents.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`leave-tab-button ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {(activeTab === "pending" || activeTab === "records") && (
        <>
          <section className="fiori-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>{activeTab === "pending" ? "Approval queue" : "Leave records"}</h3>
                <p>
                  {activeTab === "pending"
                    ? "Escalated requests currently assigned for administration review"
                    : "Complete leave history with enterprise-grade filtering"}
                </p>
              </div>
            </div>

            <div className="lhf-bar-container">
              {/* Row 1: Search, Status, Department, Leave type, Sort */}
              <div className="lhf-row-top lhf-row-top-5col">
                <div className="lhf-field">
                  <span className="lhf-label">Search</span>
                  <ValueHelpSearch
                    value={searchTerm}
                    onChange={setSearchTerm}
                    suggestions={searchSuggestions}
                    placeholder="Search employee, email, department..."
                  />
                </div>

                <div className="lhf-field">
                  <span className="lhf-label">Status</span>
                  <ValueHelpSelect
                    value={statusFilter}
                    onChange={setStatusFilter}
                    searchPlaceholder="Search statuses"
                    options={[
                      { value: "all", label: "All statuses" },
                      { value: "Pending", label: "Pending" },
                      { value: "Approved", label: "Approved" },
                      { value: "Rejected", label: "Rejected" },
                      { value: "Cancelled", label: "Cancelled" },
                    ]}
                  />
                </div>

                <div className="lhf-field">
                  <span className="lhf-label">Department</span>
                  <ValueHelpSelect
                    value={departmentFilter}
                    onChange={setDepartmentFilter}
                    searchPlaceholder="Search departments"
                    options={availableDepartments.map((department) => ({
                      value: department,
                      label: department === "all" ? "All departments" : department,
                    }))}
                  />
                </div>

                <div className="lhf-field">
                  <span className="lhf-label">Leave type</span>
                  <ValueHelpSelect
                    value={typeFilter}
                    onChange={setTypeFilter}
                    searchPlaceholder="Search leave types"
                    options={availableTypes.map((type) => ({
                      value: type,
                      label: type === "all" ? "All leave types" : getLeaveTypeDisplayLabel(type),
                    }))}
                  />
                </div>

                <div className="lhf-field">
                  <span className="lhf-label">Sort by</span>
                  <ValueHelpSelect
                    value={sortBy}
                    onChange={setSortBy}
                    searchPlaceholder="Search sort options"
                    options={[
                      { value: "newest", label: "Newest first" },
                      { value: "oldest", label: "Oldest first" },
                      { value: "name", label: "Employee name" },
                      { value: "department", label: "Department" },
                      { value: "status", label: "Status" },
                    ]}
                  />
                </div>
              </div>

              {/* Row 2: Date Range (Left) & Actions (Right) */}
              <div className="lhf-row-bottom">
                <div className="lhf-date-group">
                  <div className="lhf-field lhf-field-date">
                    <span className="lhf-label">From</span>
                    <input
                      className="lhf-date-input"
                      type="date"
                      value={dateRange.start}
                      onChange={(event) => setDateRange((previous) => ({ ...previous, start: event.target.value }))}
                    />
                  </div>

                  <div className="lhf-field lhf-field-date">
                    <span className="lhf-label">To</span>
                    <input
                      className="lhf-date-input"
                      type="date"
                      value={dateRange.end}
                      onChange={(event) => setDateRange((previous) => ({ ...previous, end: event.target.value }))}
                    />
                  </div>
                </div>

                <div className="lhf-actions-group">
                  <button
                    type="button"
                    className="lhf-btn lhf-btn-clear"
                    onClick={handleClearFilters}
                    disabled={!hasActiveFilters}
                    title="Clear all active filters"
                  >
                    <RotateCcw size={15} /> Clear filters
                  </button>
                  <button
                    type="button"
                    className="lhf-btn lhf-btn-export"
                    onClick={handleExportLeaves}
                    disabled={!filteredLeaves.length}
                    title="Export filtered leave records to CSV"
                  >
                    <Download size={15} /> Export CSV
                  </button>
                </div>
              </div>
            </div>

            <div className="leave-results-bar">
              <div className="leave-results-meta">
                <Filter size={15} />
                <span>
                  Showing {filteredLeaves.length} of {activeTab === "pending" ? pendingLeaves.length : allLeaves.length} records
                </span>
              </div>
              <div className="leave-results-actions" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button type="button" className="fiori-button secondary" onClick={fetchLeaveWorkspace}>
                  Refresh
                </button>
              </div>
            </div>
          </section>

          <section className="fiori-panel leave-records-panel">
            {filteredLeaves.length === 0 ? (
              <div className="admin-empty-state">
                <CheckCircle2 size={28} />
                <div>
                  <strong>No leave records match the current view</strong>
                  <p>Adjust the filters or refresh the workspace to review more records.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="fiori-table-shell leave-history-table-shell">
                  <table className="fiori-table leave-history-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Leave</th>
                        <th>Period</th>
                        <th>Status</th>
                        <th>Approver</th>
                        <th>Notes</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLeaves.map((leave) => {
                        const isPending = leave.status === "Pending";
                        const toneClass = statusToneMap[leave.status] || "is-neutral";
                        const escalationCount = Array.isArray(leave.escalation_history)
                          ? leave.escalation_history.length
                          : 0;

                        return (
                          <tr
                            key={leave._id}
                            id={`admin-leave-${leave._id}`}
                            onClick={() => setSelectedLeaveDetails(leave)}
                            style={{ cursor: "pointer" }}
                            className={navigationState?.leaveId === leave._id ? "employee-history-row-highlight" : ""}
                          >
                            <td>
                              <button
                                type="button"
                                className="fiori-primary-cell"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEmployeeProfile(leave);
                                }}
                                style={{
                                  width: "100%",
                                  textAlign: "left",
                                  background: "transparent",
                                  border: "none",
                                  padding: 0,
                                  cursor: leave.employee_id ? "pointer" : "default",
                                }}
                                disabled={!leave.employee_id}
                                title={leave.employee_id ? "Open employee profile and project details" : undefined}
                              >
                                <strong>{leave.employee_name || "Unknown employee"}</strong>
                                <span>
                                  {leave.employee_designation || "Designation unavailable"} •{" "}
                                  {leave.employee_department || "Department unavailable"}
                                </span>
                                <span>{leave.employee_email || "No email on record"}</span>
                              </button>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="fiori-primary-cell"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEmployeeProfile(leave);
                                }}
                                style={{
                                  width: "100%",
                                  textAlign: "left",
                                  background: "transparent",
                                  border: "none",
                                  padding: 0,
                                  cursor: leave.employee_id ? "pointer" : "default",
                                }}
                                disabled={!leave.employee_id}
                                title={leave.employee_id ? "Open employee profile and project details" : undefined}
                              >
                                <strong>{getLeaveTypeDisplayLabel(leave.leave_type)}</strong>
                                <span>{getDaysLabel(leave)}</span>
                                {escalationCount > 0 ? <span>{escalationCount} escalation event(s)</span> : null}
                              </button>
                            </td>
                            <td>
                              <div className="fiori-primary-cell">
                                <span>{getLeaveWindow(leave)}</span>
                                <span>Applied {formatDateTime(leave.applied_on)}</span>
                              </div>
                            </td>
                            <td>
                              <span className={`fiori-status-pill ${toneClass}`}>{leave.status || "Pending"}</span>
                            </td>
                            <td>
                              <div className="fiori-primary-cell">
                                <span>{userMap[leave.current_approver_id]?.name || "Administration queue"}</span>
                                <span>{leave.approved_by || "Not resolved yet"}</span>
                              </div>
                            </td>
                            <td>
                              <div className="fiori-primary-cell">
                                <span>{leave.reason || "No employee reason"}</span>
                                <span>{leave.rejection_reason || "No rejection reason"}</span>
                              </div>
                            </td>
                            <td>
                              <div className="employee-table-actions">
                                {isPending ? (
                                  <>
                                    <button
                                      className="fiori-button secondary danger"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setRejectModal({ show: true, leaveId: leave._id, reason: "" });
                                      }}
                                    >
                                      Reject
                                    </button>
                                    <button
                                      className="fiori-button primary"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openApproveModal(leave);
                                      }}
                                    >
                                      Approve
                                    </button>
                                  </>
                                ) : (
                                  <span>{formatDateTime(leave.approved_on || leave.rejected_on)}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="leave-history-pagination">
                  <div className="pagination-info-group">
                    <span className="fiori-stat-note">
                      Showing {Math.min((adminPage - 1) * adminPageSize + 1, filteredLeaves.length)}–
                      {Math.min(adminPage * adminPageSize, filteredLeaves.length)} of {filteredLeaves.length} decisions
                    </span>
                    <select
                      className="pagination-per-page-select"
                      value={adminPageSize}
                      onChange={(e) => {
                        setAdminPageSize(Number(e.target.value));
                        setAdminPage(1);
                      }}
                    >
                      <option value={6}>6 per page</option>
                      <option value={10}>10 per page</option>
                      <option value={25}>25 per page</option>
                      <option value={50}>50 per page</option>
                    </select>
                  </div>

                  {adminPageCount > 1 && (
                    <div className="leave-history-page-controls">
                      <button
                        type="button"
                        className="fiori-button secondary"
                        onClick={() => setAdminPage((p) => Math.max(1, p - 1))}
                        disabled={adminPage === 1}
                      >
                        Prev
                      </button>
                      {Array.from({ length: adminPageCount }, (_, i) => i + 1)
                        .filter((p) => p === 1 || p === adminPageCount || Math.abs(p - adminPage) <= 2)
                        .map((page, index, array) => {
                          const prev = array[index - 1];
                          return (
                            <React.Fragment key={page}>
                              {prev && page - prev > 1 ? <span className="leave-history-page-gap">...</span> : null}
                              <button
                                type="button"
                                className={`leave-history-page-number ${adminPage === page ? "is-active" : ""}`}
                                onClick={() => setAdminPage(page)}
                              >
                                {page}
                              </button>
                            </React.Fragment>
                          );
                        })}
                      <button
                        type="button"
                        className="fiori-button secondary"
                        onClick={() => setAdminPage((p) => Math.min(adminPageCount, p + 1))}
                        disabled={adminPage === adminPageCount}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </>
      )}

      {activeTab === "analytics" && (
        <>
          <div className="admin-analytics-grid leave-analytics-grid">
            <article
              className="fiori-panel fiori-chart-card is-clickable"
              onClick={() => openTab("records", { statusFilter: "all", typeFilter: "all", departmentFilter: "all", searchTerm: "" })}
              onKeyDown={(event) =>
                handleCardKeyDown(event, () =>
                  openTab("records", { statusFilter: "all", typeFilter: "all", departmentFilter: "all", searchTerm: "" })
                )
              }
              role="button"
              tabIndex={0}
            >
              <div className="fiori-panel-header">
                <div>
                  <h3>Leave status breakdown</h3>
                  <p>Distribution of request outcomes across all leave records</p>
                </div>
                <BarChart3 size={18} />
              </div>
              <div className="fiori-chart-shell">
                <div className="leave-chart-canvas leave-chart-canvas-pie">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={leaveStatusData}
                        dataKey="statusCount"
                        nameKey="statusLabel"
                        innerRadius={60}
                        outerRadius={94}
                        paddingAngle={3}
                      >
                        {leaveStatusData.map((entry) => (
                          <Cell key={entry.statusLabel} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="leave-status-legend">
                  {leaveStatusData.map((entry) => (
                    <div key={entry.statusLabel} className="leave-status-legend-item">
                      <span className="leave-status-legend-dot" style={{ backgroundColor: entry.color }} />
                      <span>{entry.statusLabel}</span>
                      <strong>{entry.statusCount}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <article className="fiori-panel fiori-chart-card leave-fortnight-card">
              <div className="fiori-panel-header leave-analytics-card-header">
                <div>
                  <h3>Fortnight-wise leave report</h3>
                  <p>Approved versus pending leave requests split into the first and second half of the selected month</p>
                </div>
                <div className="leave-analytics-card-control" onClick={(event) => event.stopPropagation()}>
                  <label className="fiori-form-field">
                    <span className="leave-field-label">Month</span>
                    <ValueHelpSelect
                      value={selectedFortnightMonth}
                      onChange={setSelectedFortnightMonth}
                      searchPlaceholder="Search months"
                      placeholder="Select month"
                      options={availableAnalyticsMonths}
                    />
                  </label>
                </div>
              </div>
              <div className="fiori-chart-shell">
                <div className="leave-chart-canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fortnightStatusData} barCategoryGap={30} margin={{ top: 12, right: 16, left: 24, bottom: 28 }}>
                      <CartesianGrid stroke="#e8edf3" vertical={false} />
                      <XAxis
                        dataKey="fortnightLabel"
                        tickLine={false}
                        axisLine={false}
                        tick={chartAxisTick}
                        label={{ ...chartAxisLabel, value: "Fortnight", position: "bottom", offset: 8 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tick={chartAxisTick}
                        label={{ ...chartAxisLabel, value: "Requests", angle: -90, position: "left", offset: 6 }}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="approvedCount" fill="#107e3e" radius={[8, 8, 0, 0]} name="Approved" />
                      <Bar dataKey="pendingCount" fill="#f0ab00" radius={[8, 8, 0, 0]} name="Pending" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="leave-fortnight-summary">
                  {fortnightStatusData.map((entry) => (
                    <div key={entry.fortnightLabel} className="leave-fortnight-summary-item">
                      <strong>{entry.fortnightLabel}</strong>
                      <span>{entry.windowLabel}</span>
                      <span>Approved: {entry.approvedCount}</span>
                      <span>Pending: {entry.pendingCount}</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <article
              className="fiori-panel fiori-chart-card is-clickable"
              onClick={() => openTab("records", { statusFilter: "all", typeFilter: "all", departmentFilter: "all", searchTerm: "" })}
              onKeyDown={(event) =>
                handleCardKeyDown(event, () =>
                  openTab("records", { statusFilter: "all", typeFilter: "all", departmentFilter: "all", searchTerm: "" })
                )
              }
              role="button"
              tabIndex={0}
            >
              <div className="fiori-panel-header">
                <div>
                  <h3>Monthly leave trend</h3>
                  <p>Requests, approvals, and rejections across the last six months</p>
                </div>
                <Activity size={18} />
              </div>
              <div className="fiori-chart-shell">
                <div className="leave-chart-canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyTrendData} margin={{ top: 12, right: 16, left: 24, bottom: 28 }}>
                      <CartesianGrid stroke="#e8edf3" vertical={false} />
                      <XAxis
                        dataKey="monthLabel"
                        tickLine={false}
                        axisLine={false}
                        tick={chartAxisTick}
                        label={{ ...chartAxisLabel, value: "Month", position: "bottom", offset: 8 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tick={chartAxisTick}
                        label={{ ...chartAxisLabel, value: "Requests", angle: -90, position: "left", offset: 6 }}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="requests" stroke="#0a6ed1" fill="rgba(10, 110, 209, 0.18)" name="Requests" strokeWidth={2} />
                      <Area type="monotone" dataKey="approved" stroke="#5b738b" fill="rgba(91, 115, 139, 0.14)" name="Approved" strokeWidth={2} />
                      <Area type="monotone" dataKey="rejected" stroke="#bb0000" fill="rgba(187, 0, 0, 0.08)" name="Rejected" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </article>

            <article
              className="fiori-panel fiori-chart-card is-clickable"
              onClick={() => openTab("records", { statusFilter: "all", typeFilter: "all", departmentFilter: "all", searchTerm: "" })}
              onKeyDown={(event) =>
                handleCardKeyDown(event, () =>
                  openTab("records", { statusFilter: "all", typeFilter: "all", departmentFilter: "all", searchTerm: "" })
                )
              }
              role="button"
              tabIndex={0}
            >
              <div className="fiori-panel-header">
                <div>
                  <h3>Leave type demand</h3>
                  <p>Volume by leave category across the current dataset</p>
                </div>
                <CalendarClock size={18} />
              </div>
              <div className="fiori-chart-shell">
                <div className="leave-chart-canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={leaveTypeData} barCategoryGap={18} margin={{ top: 12, right: 16, left: 24, bottom: 28 }}>
                      <CartesianGrid stroke="#e8edf3" vertical={false} />
                      <XAxis
                        dataKey="leaveTypeLabel"
                        tickLine={false}
                        axisLine={false}
                        tick={chartAxisTick}
                        label={{ ...chartAxisLabel, value: "Leave Type", position: "bottom", offset: 8 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tick={chartAxisTick}
                        label={{ ...chartAxisLabel, value: "Requests", angle: -90, position: "left", offset: 6 }}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="requestCount" fill="#0a6ed1" radius={[8, 8, 0, 0]} name="Requests" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </article>

            <article
              className="fiori-panel fiori-chart-card is-clickable"
              onClick={() => openTab("records", { statusFilter: "all", typeFilter: "all", departmentFilter: "all", searchTerm: "" })}
              onKeyDown={(event) =>
                handleCardKeyDown(event, () =>
                  openTab("records", { statusFilter: "all", typeFilter: "all", departmentFilter: "all", searchTerm: "" })
                )
              }
              role="button"
              tabIndex={0}
            >
              <div className="fiori-panel-header">
                <div>
                  <h3>Department leave load</h3>
                  <p>Departments with the highest leave request volume</p>
                </div>
                <Users size={18} />
              </div>
              <div className="fiori-chart-shell">
                <div className="leave-chart-canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={departmentLoadData} barCategoryGap={18} margin={{ top: 12, right: 16, left: 24, bottom: 28 }}>
                      <CartesianGrid stroke="#e8edf3" vertical={false} />
                      <XAxis
                        dataKey="departmentLabel"
                        tickLine={false}
                        axisLine={false}
                        tick={chartAxisTick}
                        label={{ ...chartAxisLabel, value: "Department", position: "bottom", offset: 8 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tick={chartAxisTick}
                        label={{ ...chartAxisLabel, value: "Requests", angle: -90, position: "left", offset: 6 }}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="requestCount" fill="#5b738b" radius={[8, 8, 0, 0]} name="Requests" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </article>

            <article
              className="fiori-panel fiori-chart-card is-clickable"
              onClick={() => openTab("escalations")}
              onKeyDown={(event) => handleCardKeyDown(event, () => openTab("escalations"))}
              role="button"
              tabIndex={0}
            >
              <div className="fiori-panel-header">
                <div>
                  <h3>Escalation trend</h3>
                  <p>Monthly count of leave requests that breached approval SLA</p>
                </div>
                <GitBranch size={18} />
              </div>
              <div className="fiori-chart-shell">
                <div className="leave-chart-canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={escalationMonthlyData} margin={{ top: 12, right: 16, left: 24, bottom: 28 }}>
                      <CartesianGrid stroke="#e8edf3" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        tick={chartAxisTick}
                        label={{ ...chartAxisLabel, value: "Month", position: "bottom", offset: 8 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tick={chartAxisTick}
                        label={{ ...chartAxisLabel, value: "Escalations", angle: -90, position: "left", offset: 6 }}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Line type="monotone" dataKey="escalations" stroke="#0f2742" strokeWidth={2.5} dot={{ r: 4 }} name="Escalations" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </article>

            <article
              className="fiori-panel fiori-chart-card is-clickable"
              onClick={() => openTab("records", { statusFilter: "Approved", typeFilter: "all", departmentFilter: "all", searchTerm: "" })}
              onKeyDown={(event) =>
                handleCardKeyDown(event, () =>
                  openTab("records", { statusFilter: "Approved", typeFilter: "all", departmentFilter: "all", searchTerm: "" })
                )
              }
              role="button"
              tabIndex={0}
            >
              <div className="fiori-panel-header">
                <div>
                  <h3>Resolution turnaround</h3>
                  <p>Average resolution time in days by leave type</p>
                </div>
                <Clock3 size={18} />
              </div>
              <div className="fiori-chart-shell">
                <div className="leave-chart-canvas">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={resolutionTurnaroundData} barCategoryGap={18} margin={{ top: 12, right: 16, left: 24, bottom: 28 }}>
                      <CartesianGrid stroke="#e8edf3" vertical={false} />
                      <XAxis
                        dataKey="leaveTypeLabel"
                        tickLine={false}
                        axisLine={false}
                        tick={chartAxisTick}
                        label={{ ...chartAxisLabel, value: "Leave Type", position: "bottom", offset: 8 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={chartAxisTick}
                        label={{ ...chartAxisLabel, value: "Average Days", angle: -90, position: "left", offset: 6 }}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="averageDays" fill="#91c8f6" radius={[8, 8, 0, 0]} name="Avg days" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </article>
          </div>
        </>
      )}

      {activeTab === "escalations" && (
        <>
          <section className="fiori-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>Approver escalation ledger</h3>
                <p>
                  Counts are attributed to the approver who did not act before the request escalated,
                  not to the employee who applied for leave.
                </p>
              </div>
            </div>

            <div className="leave-filter-grid leave-filter-grid-compact">
              <label className="fiori-form-field">
                <span className="leave-field-label">Search approver</span>
                <div className="leave-search-field">
                  <Search size={16} />
                  <input
                    className="input"
                    placeholder="Search by approver name, email, or department"
                    value={escalationSearch}
                    onChange={(event) => setEscalationSearch(event.target.value)}
                  />
                </div>
              </label>
            </div>
          </section>

          <section className="leave-escalation-grid">
            {escalationOwners.length === 0 ? (
              <div className="admin-empty-state">
                <CheckCircle2 size={28} />
                <div>
                  <strong>No escalation records found</strong>
                  <p>Either no leave request has escalated yet or the current search returned no matches.</p>
                </div>
              </div>
            ) : (
              escalationOwners.map((owner) => (
                <article
                  key={owner.id}
                  className="fiori-panel escalation-owner-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedEscalationOwner(owner)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedEscalationOwner(owner);
                    }
                  }}
                >
                  <div className="fiori-panel-header">
                    <div>
                      <h3>{owner.name}</h3>
                      <p>{owner.email || "Email unavailable"}</p>
                    </div>
                    <div className="fiori-counter">{owner.count}</div>
                  </div>

                  <div className="admin-approval-metadata">
                    <span>{owner.role || "Approver"}</span>
                    <span>{owner.employeesAffected} employee(s) impacted</span>
                    <span>{owner.pendingCount} escalated request(s) still open</span>
                    <span>Latest on {formatDate(owner.latestEscalation)}</span>
                  </div>

                  <div className="leave-escalation-summary">
                    <div>
                      <span>Departments impacted</span>
                      <strong>{owner.departments.join(", ") || "Not available"}</strong>
                    </div>
                    <div>
                      <span>Open detailed ledger</span>
                      <strong>Review date, time, employee, and escalation path</strong>
                    </div>
                  </div>
                </article>
              ))
            )}
          </section>
        </>
      )}

      {selectedEscalationOwner && (
        <div className="admin-modal-overlay" onClick={() => setSelectedEscalationOwner(null)}>
          <div className="admin-modal admin-modal-wide" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <div className="admin-section-overline">Leave Escalations</div>
                <h2>{selectedEscalationOwner.name}</h2>
                <p>
                  Detailed escalation history for approvals that were not actioned within SLA
                </p>
              </div>
              <button className="fiori-button secondary" onClick={() => setSelectedEscalationOwner(null)}>
                Close
              </button>
            </div>

            <div className="admin-dashboard-grid admin-dashboard-grid-compact">
              <article className="fiori-stat-card">
                <div className="fiori-stat-label">Total escalations</div>
                <div className="fiori-stat-value">{selectedEscalationOwner.count}</div>
                <div className="fiori-stat-note">Requests escalated away from this approver</div>
              </article>
              <article className="fiori-stat-card">
                <div className="fiori-stat-label">Open escalations</div>
                <div className="fiori-stat-value">{selectedEscalationOwner.pendingCount}</div>
                <div className="fiori-stat-note">Cases still unresolved at the time of review</div>
              </article>
              <article className="fiori-stat-card">
                <div className="fiori-stat-label">Employees affected</div>
                <div className="fiori-stat-value">{selectedEscalationOwner.employeesAffected}</div>
                <div className="fiori-stat-note">Unique employees impacted by delayed approval</div>
              </article>
            </div>

            <div className="fiori-table-shell">
              <table className="fiori-table">
                <thead>
                  <tr>
                    <th>Escalated On</th>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>Leave Type</th>
                    <th>Requested Period</th>
                    <th>Escalated To</th>
                    <th>Current Status</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedEscalationOwner.events.map((event) => (
                    <tr key={event.key}>
                      <td>{formatDateTime(event.escalatedAt)}</td>
                      <td>
                        <div className="fiori-primary-cell">
                          <strong>{event.employeeName}</strong>
                          <span>Applied {formatDate(event.appliedOn)}</span>
                        </div>
                      </td>
                      <td>{event.employeeDepartment}</td>
                      <td>{event.leaveType}</td>
                      <td>{`${formatDate(event.requestedFrom)} to ${formatDate(event.requestedTo)}`}</td>
                      <td>{event.escalatedToName}</td>
                      <td>
                        <div className={`fiori-status-pill ${statusToneMap[event.status] || "is-neutral"}`}>
                          {event.status}
                        </div>
                      </td>
                      <td>{event.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {rejectModal.show && (
        <div className="admin-modal-overlay" onClick={() => setRejectModal({ show: false, leaveId: null, reason: "" })}>
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <div className="admin-section-overline">Leave Action</div>
                <h2>Reject leave request</h2>
                <p>Provide a rejection reason for audit traceability and employee communication.</p>
              </div>
            </div>

            <label className="fiori-form-field">
              <label>Rejection reason</label>
              <textarea
                className="input leave-textarea"
                rows={5}
                value={rejectModal.reason}
                onChange={(event) => setRejectModal((previous) => ({ ...previous, reason: event.target.value }))}
              />
            </label>

            <div className="admin-modal-actions">
              <button className="fiori-button secondary" onClick={() => setRejectModal({ show: false, leaveId: null, reason: "" })}>
                Cancel
              </button>
              <button className="fiori-button danger" onClick={confirmReject}>
                Confirm rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {approvalModal.show && (
        <div
          className="admin-modal-overlay"
          onClick={() =>
            setApprovalModal({
              show: false,
              leaveId: null,
              approverName: user?.name || user?.email || "",
              originalStart: "",
              originalEnd: "",
              approvedStart: "",
              approvedEnd: "",
            })
          }
        >
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <div className="admin-section-overline">Leave Action</div>
                <h2>Approve leave request</h2>
                <p>Approve the full request or narrow the approved date range for partial approval.</p>
              </div>
            </div>

            <div className="leave-modal-grid">
              <label className="fiori-form-field">
                <label>Approver name</label>
                <input
                  className="input"
                  value={approvalModal.approverName}
                  onChange={(event) =>
                    setApprovalModal((previous) => ({ ...previous, approverName: event.target.value }))
                  }
                />
              </label>

              <div className="leave-static-card">
                <span>Requested range</span>
                <strong>{`${formatDate(approvalModal.originalStart)} to ${formatDate(approvalModal.originalEnd)}`}</strong>
              </div>

              <label className="fiori-form-field">
                <label>Approved start date</label>
                <input
                  className="input"
                  type="date"
                  min={approvalModal.originalStart}
                  max={approvalModal.originalEnd}
                  value={approvalModal.approvedStart}
                  onChange={(event) =>
                    setApprovalModal((previous) => ({ ...previous, approvedStart: event.target.value }))
                  }
                />
              </label>

              <label className="fiori-form-field">
                <label>Approved end date</label>
                <input
                  className="input"
                  type="date"
                  min={approvalModal.approvedStart || approvalModal.originalStart}
                  max={approvalModal.originalEnd}
                  value={approvalModal.approvedEnd}
                  onChange={(event) =>
                    setApprovalModal((previous) => ({ ...previous, approvedEnd: event.target.value }))
                  }
                />
              </label>
            </div>

            <div className="admin-modal-actions">
              <button
                className="fiori-button secondary"
                onClick={() =>
                  setApprovalModal({
                    show: false,
                    leaveId: null,
                    approverName: user?.name || user?.email || "",
                    originalStart: "",
                    originalEnd: "",
                    approvedStart: "",
                    approvedEnd: "",
                  })
                }
              >
                Cancel
              </button>
              <button className="fiori-button primary" onClick={confirmApprove}>
                Confirm approval
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`admin-toast ${
            message.toLowerCase().includes("unable") || message.toLowerCase().includes("required")
              ? "is-error"
              : "is-success"
          }`}
        >
          {message}
        </div>
      )}

      {selectedLeaveDetails ? (
        <LeaveDetailModal
          leave={selectedLeaveDetails}
          onClose={() => setSelectedLeaveDetails(null)}
          isAdminOrManager
        />
      ) : null}
    </section>
  );
};

export default AdminLeaves;
