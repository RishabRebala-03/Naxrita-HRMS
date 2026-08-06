import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarDays,
  ClipboardList,
  FolderKanban,
  Plus,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import ValueHelpSelect from "./ValueHelpSelect";
import ValueHelpSearch from "./ValueHelpSearch";
import { buildRequesterHeaders } from "../utils/requester";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const STATUSES = ["All", "Active", "Completed", "On Hold", "Planning"];
const PROJECT_TABS = [
  { key: "portfolio", label: "Portfolio" },
  { key: "oversight", label: "Oversight" },
  { key: "time", label: "Time" },
  { key: "leaves", label: "Leaves & collisions" },
  { key: "visuals", label: "Visuals" },
  { key: "table", label: "Raw table" },
];
const COLORS = ["#0a6ed1", "#5b738b", "#8fb5d9", "#d1e3f8", "#0f2742", "#91c8f6"];

const statusToneMap = {
  Active: "is-approved",
  Completed: "is-neutral",
  "On Hold": "is-pending",
  Planning: "is-neutral",
};

const toDateKey = (value) => {
  if (!value) return "";
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return "";
  }
};

const formatDate = (value) => {
  const key = toDateKey(value);
  if (!key) return "Not set";
  return new Date(key).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const daysBetween = (start, end) => {
  const startKey = toDateKey(start);
  const endKey = toDateKey(end) || toDateKey(new Date());
  if (!startKey) return 0;
  return Math.max(1, Math.ceil((new Date(endKey) - new Date(startKey)) / 86400000) + 1);
};

const overlaps = (leftStart, leftEnd, rightStart, rightEnd) => {
  const aStart = toDateKey(leftStart);
  const aEnd = toDateKey(leftEnd) || "9999-12-31";
  const bStart = toDateKey(rightStart) || "0000-01-01";
  const bEnd = toDateKey(rightEnd) || "9999-12-31";
  if (!aStart) return false;
  return aStart <= bEnd && aEnd >= bStart;
};

const expandDateRange = (start, end) => {
  const startKey = toDateKey(start);
  const endKey = toDateKey(end) || startKey;
  if (!startKey) return [];
  const dates = [];
  const cursor = new Date(startKey);
  const last = new Date(endKey);
  while (cursor <= last && dates.length < 370) {
    dates.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const normalize = (value) => String(value || "").trim().toLowerCase();

const projectMatchesAssignment = (project, assignment) =>
  normalize(assignment.projectId) === normalize(project._id) ||
  normalize(assignment.projectName) === normalize(project.title) ||
  normalize(assignment.projectName) === normalize(project.projectId);

const buildSearchSuggestions = (items, fields) => {
  const seen = new Set();
  return items.flatMap((item) =>
    fields
      .map((field) => (typeof field === "function" ? field(item) : item[field]))
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

const Projects = ({ user }) => {
  const [activeTab, setActiveTab] = useState("portfolio");
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [filters, setFilters] = useState({
    search: "",
    status: "All",
    person: "All",
    department: "All",
    durationBand: "All",
    workloadBand: "All",
    leaveRisk: "All",
    startFrom: "",
    startTo: "",
    endFrom: "",
    endTo: "",
    activeOn: "",
    minPeople: "",
    maxPeople: "",
    minHours: "",
    maxHours: "",
    sortBy: "risk",
  });
  const [projectForm, setProjectForm] = useState({
    projectId: "",
    title: "",
    startDate: "",
    endDate: "",
    description: "",
    status: "Active",
  });

  const fetchWorkspace = async () => {
    setLoading(true);
    try {
      const requesterHeaders = buildRequesterHeaders(user);
      const [projectRes, userRes, timesheetRes, leaveRes] = await Promise.all([
        fetch(`${API_BASE}/api/projects/`),
        fetch(`${API_BASE}/api/users/get_all_employees`, { headers: requesterHeaders }),
        fetch(`${API_BASE}/api/timesheets/all`),
        fetch(`${API_BASE}/api/leaves/all`),
      ]);
      const [projectData, userData, timesheetData, leaveData] = await Promise.all([
        projectRes.json(),
        userRes.json(),
        timesheetRes.json(),
        leaveRes.json(),
      ]);
      setProjects(Array.isArray(projectData) ? projectData : []);
      setUsers(Array.isArray(userData) ? userData : []);
      setTimesheets(Array.isArray(timesheetData) ? timesheetData : []);
      setLeaves(Array.isArray(leaveData) ? leaveData : []);
    } catch (error) {
      console.error("Error loading project workspace:", error);
      setMessage("Failed to load project workspace");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspace();
  }, []);

  const showToast = (nextMessage) => {
    setMessage(nextMessage);
    window.setTimeout(() => setMessage(""), 3000);
  };

  const assignments = useMemo(() => {
    return users.flatMap((user) =>
      (user.projects || []).map((assignment) => {
        const project = projects.find((item) => projectMatchesAssignment(item, assignment));
        return {
          ...assignment,
          project,
          projectKey: project?._id || assignment.projectId || assignment.projectName,
          projectTitle: project?.title || assignment.projectName || "Unmapped project",
          projectCode: project?.projectId || "",
          projectStatus: project?.status || "Unknown",
          employeeId: user._id,
          employeeName: user.name || "Unknown employee",
          employeeEmail: user.email || "",
          department: user.department || "Unassigned",
          designation: user.designation || "Unassigned",
          startDate: assignment.startDate || project?.startDate,
          endDate: assignment.endDate || project?.endDate,
        };
      })
    );
  }, [projects, users]);

  const projectInsights = useMemo(() => {
    return projects.map((project) => {
      const projectAssignments = assignments.filter((assignment) => assignment.project?._id === project._id);
      const projectEmployees = new Set(projectAssignments.map((assignment) => assignment.employeeId));
      const projectLeaves = leaves.filter((leave) =>
        projectEmployees.has(leave.employee_id) &&
        projectAssignments.some((assignment) =>
          assignment.employeeId === leave.employee_id &&
          overlaps(leave.approved_start_date || leave.start_date, leave.approved_end_date || leave.end_date, assignment.startDate, assignment.endDate || project.endDate)
        )
      );
      const projectTimesheets = timesheets.filter((timesheet) =>
        projectEmployees.has(timesheet.employee_id) &&
        projectAssignments.some((assignment) =>
          assignment.employeeId === timesheet.employee_id &&
          overlaps(timesheet.period_start, timesheet.period_end, assignment.startDate, assignment.endDate || project.endDate)
        )
      );
      const hours = projectTimesheets.reduce((sum, timesheet) => {
        const concurrent = assignments.filter((assignment) =>
          assignment.employeeId === timesheet.employee_id &&
          overlaps(timesheet.period_start, timesheet.period_end, assignment.startDate, assignment.endDate)
        ).length || 1;
        return sum + Number(timesheet.total_hours || 0) / concurrent;
      }, 0);
      const leaveDateMap = new Map();
      projectLeaves.forEach((leave) => {
        expandDateRange(leave.approved_start_date || leave.start_date, leave.approved_end_date || leave.end_date).forEach((date) => {
          const bucket = leaveDateMap.get(date) || new Set();
          bucket.add(leave.employee_id);
          leaveDateMap.set(date, bucket);
        });
      });
      const collisionDates = Array.from(leaveDateMap.entries()).filter(([, employees]) => employees.size > 1);
      const durationDays = daysBetween(project.startDate, project.endDate);
      const riskScore = collisionDates.length * 8 + projectLeaves.length * 2 + Math.max(0, projectEmployees.size - 4);

      return {
        ...project,
        peopleCount: projectEmployees.size,
        departments: [...new Set(projectAssignments.map((assignment) => assignment.department))],
        assignments: projectAssignments,
        hours: Math.round(hours * 10) / 10,
        leaves: projectLeaves,
        leaveCount: projectLeaves.length,
        collisionDates,
        collisionCount: collisionDates.length,
        durationDays,
        riskScore,
      };
    });
  }, [assignments, leaves, projects, timesheets]);

  const peopleOptions = useMemo(
    () => ["All", ...Array.from(new Set(assignments.map((assignment) => assignment.employeeName).filter(Boolean))).sort()],
    [assignments]
  );
  const departmentOptions = useMemo(
    () => ["All", ...Array.from(new Set(assignments.map((assignment) => assignment.department).filter(Boolean))).sort()],
    [assignments]
  );
  const searchSuggestions = useMemo(
    () => buildSearchSuggestions(projectInsights, ["title", "projectId", "description", "status", (item) => item.departments.join(", ")]),
    [projectInsights]
  );

  const filteredProjects = useMemo(() => {
    const query = normalize(filters.search);
    return projectInsights
      .filter((project) => {
        if (query && ![project.title, project.projectId, project.description, project.status, ...project.departments].some((value) => normalize(value).includes(query))) return false;
        if (filters.status !== "All" && project.status !== filters.status) return false;
        if (filters.person !== "All" && !project.assignments.some((assignment) => assignment.employeeName === filters.person)) return false;
        if (filters.department !== "All" && !project.departments.includes(filters.department)) return false;
        if (filters.startFrom && toDateKey(project.startDate) < filters.startFrom) return false;
        if (filters.startTo && toDateKey(project.startDate) > filters.startTo) return false;
        if (filters.endFrom && toDateKey(project.endDate) < filters.endFrom) return false;
        if (filters.endTo && toDateKey(project.endDate) > filters.endTo) return false;
        if (filters.activeOn && !overlaps(project.startDate, project.endDate, filters.activeOn, filters.activeOn)) return false;
        if (filters.minPeople && project.peopleCount < Number(filters.minPeople)) return false;
        if (filters.maxPeople && project.peopleCount > Number(filters.maxPeople)) return false;
        if (filters.minHours && project.hours < Number(filters.minHours)) return false;
        if (filters.maxHours && project.hours > Number(filters.maxHours)) return false;
        if (filters.durationBand === "Short" && project.durationDays > 30) return false;
        if (filters.durationBand === "Medium" && (project.durationDays <= 30 || project.durationDays > 90)) return false;
        if (filters.durationBand === "Long" && project.durationDays <= 90) return false;
        if (filters.workloadBand === "No hours" && project.hours > 0) return false;
        if (filters.workloadBand === "Low" && (project.hours <= 0 || project.hours > 80)) return false;
        if (filters.workloadBand === "Medium" && (project.hours <= 80 || project.hours > 240)) return false;
        if (filters.workloadBand === "High" && project.hours <= 240) return false;
        if (filters.leaveRisk === "With leaves" && project.leaveCount === 0) return false;
        if (filters.leaveRisk === "Collisions only" && project.collisionCount === 0) return false;
        if (filters.leaveRisk === "No collisions" && project.collisionCount > 0) return false;
        return true;
      })
      .sort((first, second) => {
        switch (filters.sortBy) {
          case "hours":
            return second.hours - first.hours;
          case "people":
            return second.peopleCount - first.peopleCount;
          case "start":
            return new Date(first.startDate || 0) - new Date(second.startDate || 0);
          case "end":
            return new Date(first.endDate || "9999-12-31") - new Date(second.endDate || "9999-12-31");
          case "name":
            return (first.title || "").localeCompare(second.title || "");
          case "risk":
          default:
            return second.riskScore - first.riskScore;
        }
      });
  }, [filters, projectInsights]);

  const totals = useMemo(() => ({
    projects: filteredProjects.length,
    active: filteredProjects.filter((project) => project.status === "Active").length,
    people: new Set(filteredProjects.flatMap((project) => project.assignments.map((assignment) => assignment.employeeId))).size,
    hours: Math.round(filteredProjects.reduce((sum, project) => sum + project.hours, 0)),
    leaves: filteredProjects.reduce((sum, project) => sum + project.leaveCount, 0),
    collisions: filteredProjects.reduce((sum, project) => sum + project.collisionCount, 0),
  }), [filteredProjects]);

  const statusChart = useMemo(() => STATUSES.filter((status) => status !== "All").map((status) => ({
    name: status,
    value: filteredProjects.filter((project) => project.status === status).length,
  })), [filteredProjects]);
  const hoursChart = useMemo(() => filteredProjects.slice(0, 8).map((project) => ({
    name: project.projectId || project.title,
    hours: project.hours,
    people: project.peopleCount,
    collisions: project.collisionCount,
  })), [filteredProjects]);
  const leaveTimeline = useMemo(() => {
    const buckets = {};
    filteredProjects.flatMap((project) => project.leaves).forEach((leave) => {
      const month = toDateKey(leave.start_date || leave.approved_start_date).slice(0, 7);
      if (!month) return;
      buckets[month] = (buckets[month] || 0) + 1;
    });
    return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }));
  }, [filteredProjects]);

  const collisionRows = useMemo(() => filteredProjects.flatMap((project) =>
    project.collisionDates.map(([date, employeeSet]) => ({
      projectTitle: project.title,
      projectId: project.projectId,
      date,
      count: employeeSet.size,
      employees: project.leaves
        .filter((leave) => employeeSet.has(leave.employee_id) && expandDateRange(leave.start_date, leave.end_date).includes(date))
        .map((leave) => leave.employee_name || leave.employee_email || leave.employee_id)
        .filter(Boolean),
    }))
  ), [filteredProjects]);
  const changeFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  const handleCreateProject = async () => {
    if (!projectForm.projectId || !projectForm.title || !projectForm.startDate) {
      showToast("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/projects/create`, {
        method: "POST",
        headers: buildRequesterHeaders(user, { "Content-Type": "application/json" }),
        body: JSON.stringify(projectForm),
      });
      const data = await response.json();
      if (!response.ok) {
        showToast(data.error || "Failed to create project");
        return;
      }
      await fetchWorkspace();
      setShowNewProjectModal(false);
      setProjectForm({ projectId: "", title: "", startDate: "", endDate: "", description: "", status: "Active" });
      showToast("Project created successfully");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async (projectId) => {
    if (!window.confirm("Delete this project and remove it from assigned employees?")) return;
    const response = await fetch(`${API_BASE}/api/projects/${projectId}`, {
      method: "DELETE",
      headers: buildRequesterHeaders(user),
    });
    if (!response.ok) {
      showToast("Failed to delete project");
      return;
    }
    await fetchWorkspace();
    showToast("Project deleted successfully");
  };

  return (
    <section className="projects-workspace">
      <header className="admin-hero">
        <div className="admin-hero-copy">
          <div className="admin-section-overline">Project Portfolio</div>
          <h1>Projects</h1>
          <p>
            Manage project records, staffing context, and oversight views from one place.
          </p>
        </div>
        <div className="admin-hero-meta">
          <div className="admin-hero-meta-item"><span>Primary View</span><strong>Portfolio workspace</strong></div>
          <div className="admin-hero-meta-item"><span>Built For</span><strong>Operational oversight</strong></div>
          <div className="admin-hero-meta-item"><span>Includes</span><strong>Tables, filters, visuals</strong></div>
          <div className="admin-hero-meta-item"><span>Outcome</span><strong>Clear project visibility</strong></div>
        </div>
      </header>

      <nav className="page-subtab-strip" aria-label="Project admin sections">
        {PROJECT_TABS.map((tab) => (
          <button key={tab.key} type="button" className={`page-subtab-button ${activeTab === tab.key ? "is-active" : ""}`} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="fiori-panel">
        <div className="fiori-panel-header">
          <div>
            <h3>Filters</h3>
            <p>Filter by staffing, duration, dates, workload, leave risk, and project metadata.</p>
          </div>
          <button className="fiori-button primary" onClick={() => setShowNewProjectModal(true)}>
            <Plus size={16} />
            <span>Create project</span>
          </button>
        </div>
        <div className="projects-filter-grid projects-filter-grid-wide">
          <label className="employee-filter-field employee-filter-search">
            <span>Search</span>
            <ValueHelpSearch value={filters.search} onChange={(value) => changeFilter("search", value)} suggestions={searchSuggestions} placeholder="Search project, ID, description, status, department" />
          </label>
          <label className="employee-filter-field"><span>Status</span><ValueHelpSelect value={filters.status} onChange={(value) => changeFilter("status", value)} options={STATUSES.map((status) => ({ value: status, label: status === "All" ? "All statuses" : status }))} /></label>
          <label className="employee-filter-field"><span>Person</span><ValueHelpSelect value={filters.person} onChange={(value) => changeFilter("person", value)} options={peopleOptions.map((person) => ({ value: person, label: person === "All" ? "All people" : person }))} /></label>
          <label className="employee-filter-field"><span>Department</span><ValueHelpSelect value={filters.department} onChange={(value) => changeFilter("department", value)} options={departmentOptions.map((department) => ({ value: department, label: department === "All" ? "All departments" : department }))} /></label>
          <label className="employee-filter-field"><span>Duration</span><ValueHelpSelect value={filters.durationBand} onChange={(value) => changeFilter("durationBand", value)} options={["All", "Short", "Medium", "Long"].map((value) => ({ value, label: value }))} /></label>
          <label className="employee-filter-field"><span>Workload</span><ValueHelpSelect value={filters.workloadBand} onChange={(value) => changeFilter("workloadBand", value)} options={["All", "No hours", "Low", "Medium", "High"].map((value) => ({ value, label: value }))} /></label>
          <label className="employee-filter-field"><span>Leave Risk</span><ValueHelpSelect value={filters.leaveRisk} onChange={(value) => changeFilter("leaveRisk", value)} options={["All", "With leaves", "Collisions only", "No collisions"].map((value) => ({ value, label: value }))} /></label>
          <label className="employee-filter-field"><span>Active On</span><input className="input" type="date" value={filters.activeOn} onChange={(event) => changeFilter("activeOn", event.target.value)} /></label>
          <label className="employee-filter-field"><span>Start From</span><input className="input" type="date" value={filters.startFrom} onChange={(event) => changeFilter("startFrom", event.target.value)} /></label>
          <label className="employee-filter-field"><span>Start To</span><input className="input" type="date" value={filters.startTo} onChange={(event) => changeFilter("startTo", event.target.value)} /></label>
          <label className="employee-filter-field"><span>End From</span><input className="input" type="date" value={filters.endFrom} onChange={(event) => changeFilter("endFrom", event.target.value)} /></label>
          <label className="employee-filter-field"><span>End To</span><input className="input" type="date" value={filters.endTo} onChange={(event) => changeFilter("endTo", event.target.value)} /></label>
          <label className="employee-filter-field"><span>Min People</span><input className="input" type="number" value={filters.minPeople} onChange={(event) => changeFilter("minPeople", event.target.value)} /></label>
          <label className="employee-filter-field"><span>Max People</span><input className="input" type="number" value={filters.maxPeople} onChange={(event) => changeFilter("maxPeople", event.target.value)} /></label>
          <label className="employee-filter-field"><span>Min Hours</span><input className="input" type="number" value={filters.minHours} onChange={(event) => changeFilter("minHours", event.target.value)} /></label>
          <label className="employee-filter-field"><span>Max Hours</span><input className="input" type="number" value={filters.maxHours} onChange={(event) => changeFilter("maxHours", event.target.value)} /></label>
          <label className="employee-filter-field"><span>Sort</span><ValueHelpSelect value={filters.sortBy} onChange={(value) => changeFilter("sortBy", value)} options={[
            { value: "risk", label: "Risk first" },
            { value: "hours", label: "Most hours" },
            { value: "people", label: "Most people" },
            { value: "start", label: "Earliest start" },
            { value: "end", label: "Nearest end" },
            { value: "name", label: "Name" },
          ]} /></label>
        </div>
      </section>

      {loading ? <div className="fiori-loading-card"><FolderKanban size={28} /><div><strong>Loading project oversight</strong><p>Preparing projects, employees, timesheets, and leave risk.</p></div></div> : null}

      {activeTab === "portfolio" && (
        <section className="projects-summary-grid">
          <article className="fiori-stat-card"><div className="fiori-stat-topline"><span className="fiori-stat-label">Active</span><Target size={18} /></div><div className="fiori-stat-value">{totals.active}</div><div className="fiori-stat-note">Active delivery projects</div></article>
          <article className="fiori-stat-card"><div className="fiori-stat-topline"><span className="fiori-stat-label">Time Logged</span><CalendarDays size={18} /></div><div className="fiori-stat-value">{totals.hours}</div><div className="fiori-stat-note">Estimated project hours</div></article>
          <article className="fiori-stat-card"><div className="fiori-stat-topline"><span className="fiori-stat-label">Leave Events</span><ClipboardList size={18} /></div><div className="fiori-stat-value">{totals.leaves}</div><div className="fiori-stat-note">Leaves intersecting project assignments</div></article>
          <article className="fiori-stat-card"><div className="fiori-stat-topline"><span className="fiori-stat-label">Collisions</span><Users size={18} /></div><div className="fiori-stat-value">{totals.collisions}</div><div className="fiori-stat-note">Dates with multiple project members on leave</div></article>
        </section>
      )}

      {activeTab === "oversight" && (
        <section className="fiori-panel">
          <div className="fiori-panel-header"><div><h3>Executive Oversight</h3><p>High-signal project risk and staffing table.</p></div></div>
          <ProjectTable projects={filteredProjects} formatDate={formatDate} onDelete={handleDeleteProject} />
        </section>
      )}

      {activeTab === "time" && (
        <section className="fiori-panel">
          <div className="fiori-panel-header"><div><h3>Time Investment</h3><p>Estimated time by project and employee assignment.</p></div></div>
          <div className="fiori-table-shell"><table className="fiori-table"><thead><tr><th>Project</th><th>Employee</th><th>Department</th><th>Assignment</th><th>Project Hours</th></tr></thead><tbody>
            {filteredProjects.flatMap((project) => project.assignments.map((assignment) => (
              <tr key={`${project._id}-${assignment.employeeId}-${assignment._id || assignment.startDate}`}>
                <td>{project.title}</td><td>{assignment.employeeName}</td><td>{assignment.department}</td><td>{formatDate(assignment.startDate)} to {formatDate(assignment.endDate || project.endDate)}</td><td>{Math.round((project.hours / Math.max(project.peopleCount, 1)) * 10) / 10}</td>
              </tr>
            )))}
          </tbody></table></div>
        </section>
      )}

      {activeTab === "leaves" && (
        <section className="fiori-panel">
          <div className="fiori-panel-header"><div><h3>Leave Collisions</h3><p>Project dates where multiple assigned employees are unavailable.</p></div></div>
          <div className="fiori-table-shell"><table className="fiori-table"><thead><tr><th>Project</th><th>Date</th><th>Employees Out</th><th>People</th></tr></thead><tbody>
            {collisionRows.length ? collisionRows.map((row) => <tr key={`${row.projectId}-${row.date}`}><td>{row.projectTitle}</td><td>{row.date}</td><td>{row.count}</td><td>{row.employees.join(", ")}</td></tr>) : <tr><td colSpan={4}>No leave collisions in the current filtered project set.</td></tr>}
          </tbody></table></div>
        </section>
      )}

      {activeTab === "visuals" && (
        <section className="projects-visual-grid">
          <ChartPanel title="Hours by Project"><ResponsiveContainer width="100%" height={280}><BarChart data={hoursChart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="hours" fill="#0a6ed1" /></BarChart></ResponsiveContainer></ChartPanel>
          <ChartPanel title="Status Breakdown"><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={statusChart} dataKey="value" nameKey="name" outerRadius={95} label>{statusChart.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></ChartPanel>
          <ChartPanel title="Leave Events Over Time"><ResponsiveContainer width="100%" height={280}><AreaChart data={leaveTimeline}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Area type="monotone" dataKey="count" stroke="#0f2742" fill="rgba(15,39,66,0.16)" /></AreaChart></ResponsiveContainer></ChartPanel>
        </section>
      )}

      {activeTab === "table" && (
        <section className="fiori-panel">
          <div className="fiori-panel-header"><div><h3>Project Table</h3><p>Dense operational table for export-like review.</p></div></div>
          <ProjectTable projects={filteredProjects} formatDate={formatDate} onDelete={handleDeleteProject} />
        </section>
      )}

      {showNewProjectModal && (
        <div className="admin-modal-overlay" onClick={() => setShowNewProjectModal(false)}>
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header"><div><h2>Create Project</h2><p>Add a new project record to the delivery portfolio</p></div></div>
            <div className="projects-modal-grid">
              <label className="fiori-form-field"><label>Project ID</label><input className="input" value={projectForm.projectId} onChange={(event) => setProjectForm({ ...projectForm, projectId: event.target.value })} placeholder="PROJ-001" /></label>
              <label className="fiori-form-field"><label>Project Title</label><input className="input" value={projectForm.title} onChange={(event) => setProjectForm({ ...projectForm, title: event.target.value })} placeholder="People operations platform" /></label>
              <label className="fiori-form-field"><label>Start Date</label><input className="input" type="date" value={projectForm.startDate} onChange={(event) => setProjectForm({ ...projectForm, startDate: event.target.value })} /></label>
              <label className="fiori-form-field"><label>End Date</label><input className="input" type="date" value={projectForm.endDate} onChange={(event) => setProjectForm({ ...projectForm, endDate: event.target.value })} /></label>
              <label className="fiori-form-field"><label>Status</label><ValueHelpSelect value={projectForm.status} onChange={(value) => setProjectForm({ ...projectForm, status: value })} options={STATUSES.filter((status) => status !== "All").map((status) => ({ value: status, label: status }))} /></label>
              <label className="fiori-form-field projects-modal-description"><label>Description</label><textarea value={projectForm.description} onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })} placeholder="Describe the scope, goals, or current delivery notes" /></label>
            </div>
            <div className="admin-modal-actions"><button className="fiori-button secondary" onClick={() => setShowNewProjectModal(false)}>Cancel</button><button className="fiori-button primary" onClick={handleCreateProject} disabled={saving}>{saving ? "Creating..." : "Create project"}</button></div>
          </div>
        </div>
      )}

      {message ? <div className={`admin-toast ${message.toLowerCase().includes("failed") || message.toLowerCase().includes("please") ? "is-error" : "is-success"}`}>{message}</div> : null}
    </section>
  );
};

const ChartPanel = ({ title, children }) => (
  <section className="fiori-panel">
    <div className="fiori-panel-header"><div><h3>{title}</h3></div></div>
    {children}
  </section>
);

const ProjectTable = ({ projects, formatDate, onDelete }) => (
  <div className="fiori-table-shell">
    <table className="fiori-table">
      <thead>
        <tr><th>Project</th><th>Status</th><th>People</th><th>Departments</th><th>Duration</th><th>Hours</th><th>Leaves</th><th>Collisions</th><th>Action</th></tr>
      </thead>
      <tbody>
        {projects.length ? projects.map((project) => (
          <tr key={project._id}>
            <td><div className="fiori-primary-cell"><strong>{project.title || "Untitled project"}</strong><span>{project.projectId || "No project ID"}</span></div></td>
            <td><span className={`fiori-status-pill ${statusToneMap[project.status] || "is-neutral"}`}>{project.status || "Unknown"}</span></td>
            <td>{project.peopleCount}</td>
            <td>{project.departments.join(", ") || "Unassigned"}</td>
            <td>{formatDate(project.startDate)} to {formatDate(project.endDate)}</td>
            <td>{project.hours}</td>
            <td>{project.leaveCount}</td>
            <td>{project.collisionCount}</td>
            <td><button className="fiori-button secondary danger" onClick={() => onDelete(project._id)}><Trash2 size={15} />Delete</button></td>
          </tr>
        )) : <tr><td colSpan={9}>No projects match the current filters</td></tr>}
      </tbody>
    </table>
  </div>
);

export default Projects;
