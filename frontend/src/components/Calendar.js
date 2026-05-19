import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  CalendarDays,
  Cake,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import ValueHelpSelect from "./ValueHelpSelect";

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const weekdayNames = [
  { label: "Mon", isWeekend: false },
  { label: "Tue", isWeekend: false },
  { label: "Wed", isWeekend: false },
  { label: "Thu", isWeekend: false },
  { label: "Fri", isWeekend: false },
  { label: "Sat", isWeekend: true },
  { label: "Sun", isWeekend: true },
];

const toDateKey = (value) => {
  if (!value) return "";
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return "";
  }
};

const formatMonthLabel = (value) => {
  if (!value) return "";

  try {
    return new Date(value).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
};

const isDateWithinRange = (dateStr, startDate, endDate) => {
  if (!dateStr || !startDate || !endDate) return false;
  return dateStr >= startDate && dateStr <= endDate;
};

const leaveTypeShortLabels = {
  sick: "SL",
  planned: "PL",
  casual: "CL",
  lwp: "LWP",
  lop: "LOP",
  "early logout": "EL",
};

const getLeaveTypeShortLabel = (leaveType) => {
  const normalizedType = String(leaveType || "").trim().toLowerCase();
  if (!normalizedType) return "LV";

  if (leaveTypeShortLabels[normalizedType]) {
    return leaveTypeShortLabels[normalizedType];
  }

  const initials = normalizedType
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 3);

  return initials || normalizedType.slice(0, 3).toUpperCase();
};

const handleCardKeyDown = (event, action) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
};

const Calendar = ({ user, setSection, navigationState }) => {
  const [selectedYear, setSelectedYear] = useState(
    navigationState?.focusYear || new Date().getFullYear()
  );
  const [holidays, setHolidays] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [approvedLeaves, setApprovedLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showBirthdays, setShowBirthdays] = useState(true);
  const [showLeaves, setShowLeaves] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [hasDirectReports, setHasDirectReports] = useState(false);

  const isAdmin = user?.role === "Admin";
  const isManager = user?.role === "Manager";
  const focusedDate = navigationState?.focusDate ? toDateKey(navigationState.focusDate) : "";

  useEffect(() => {
    if (navigationState?.focusYear) {
      setSelectedYear(navigationState.focusYear);
    } else if (navigationState?.focusDate) {
      const focusYear = new Date(navigationState.focusDate).getFullYear();
      if (!Number.isNaN(focusYear)) {
        setSelectedYear(focusYear);
      }
    }
  }, [navigationState]);

  const processBirthdays = useCallback(
    (users) =>
      users
        .filter((person) => person && person.dateOfBirth)
        .map((person) => {
          let dateOfBirth = person.dateOfBirth;
          if (typeof dateOfBirth === "object" && dateOfBirth.$date) {
            dateOfBirth = dateOfBirth.$date;
          }

          const parsedDate = new Date(dateOfBirth);
          if (Number.isNaN(parsedDate.getTime())) return null;

          const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
          const day = String(parsedDate.getDate()).padStart(2, "0");

          return {
            date: `${selectedYear}-${month}-${day}`,
            name: person.name,
            employeeId: person.employeeId || person._id,
            isCurrentUser: String(person._id) === String(user?.id),
          };
        })
        .filter(Boolean),
    [selectedYear, user?.id]
  );

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;

      const [holidaysResponse, leaveHistoryResponse] = await Promise.all([
        axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/holidays/?start=${startDate}&end=${endDate}`),
        axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/history/${user.id}`),
      ]);

      setHolidays(Array.isArray(holidaysResponse.data) ? holidaysResponse.data : []);

      const approvedHistory = Array.isArray(leaveHistoryResponse.data)
        ? leaveHistoryResponse.data.filter((leave) => {
            if (leave.status !== "Approved") return false;
            const rangeStart = toDateKey(leave.approved_start_date || leave.start_date);
            const rangeEnd = toDateKey(leave.approved_end_date || leave.end_date);
            return rangeStart && rangeEnd && !(rangeEnd < startDate || rangeStart > endDate);
          })
        : [];
      setApprovedLeaves(approvedHistory);

      if (isAdmin) {
        const usersResponse = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/users/`);
        setBirthdays(processBirthdays(usersResponse.data || []));
        setHasDirectReports(true);
        return;
      }

      const currentUserResponse = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/${user.id}`
      );
      const currentUserData = currentUserResponse.data;

      try {
        const teamResponse = await axios.get(
          `${process.env.REACT_APP_BACKEND_URL}/api/users/get_employees_by_manager/${encodeURIComponent(
            user.email
          )}`
        );
        const teamMembers = Array.isArray(teamResponse.data) ? teamResponse.data : [];
        const visiblePeople = teamMembers.length > 0 ? [...teamMembers, currentUserData] : [currentUserData];
        setHasDirectReports(teamMembers.length > 0);
        setBirthdays(processBirthdays(visiblePeople));
      } catch (teamError) {
        console.error("Error fetching direct reports:", teamError);
        setHasDirectReports(false);
        setBirthdays(processBirthdays([currentUserData]));
      }
    } catch (fetchError) {
      console.error("Error fetching calendar data:", fetchError);
      setError("Failed to load calendar data");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, processBirthdays, selectedYear, user?.email, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

  const getFirstDayOfMonth = (year, month) => (new Date(year, month, 1).getDay() + 6) % 7;

  const findHoliday = (year, month, day) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return holidays.find((holiday) => holiday.date === dateStr);
  };

  const findBirthdays = (year, month, day) => {
    if (!showBirthdays) return [];
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return birthdays.filter((birthday) => birthday.date === dateStr);
  };

  const findApprovedLeaves = useCallback(
    (dateStr) => {
      if (!showLeaves) return [];
      return approvedLeaves.filter((leave) =>
        isDateWithinRange(
          dateStr,
          toDateKey(leave.approved_start_date || leave.start_date),
          toDateKey(leave.approved_end_date || leave.end_date)
        )
      );
    },
    [approvedLeaves, showLeaves]
  );

  const isToday = (year, month, day) => {
    const today = new Date();
    return today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
  };

  const yearOptions = [2024, 2025, 2026, 2027, 2028];

  const sortedHolidays = useMemo(() => {
    return [...holidays].sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [holidays]);

  const sortedBirthdays = useMemo(() => {
    return [...birthdays].sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [birthdays]);

  const approvedLeaveList = useMemo(() => {
    return [...approvedLeaves].sort(
      (first, second) =>
        new Date(first.approved_start_date || first.start_date) -
        new Date(second.approved_start_date || second.start_date)
    );
  }, [approvedLeaves]);

  const publicHolidays = holidays.filter((holiday) => holiday.type === "public");
  const optionalHolidays = holidays.filter(
    (holiday) => holiday.type === "optional" || holiday.is_optional
  );

  const getBirthdayVisibilityMessage = () => {
    if (isAdmin) return "All employee birthdays";
    if (isManager) return "Your birthday plus direct-report birthdays";
    if (hasDirectReports) return "Your birthday plus direct-report birthdays";
    return "Your birthday only";
  };

  const openLeaveDay = (dateStr) => {
    setSection?.("leaves", {
      source: "calendar-day",
      focusDate: dateStr,
      historyFilterStatus: "approved",
    });
  };

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const renderMonth = (monthIndex) => {
    const daysInMonth = getDaysInMonth(selectedYear, monthIndex);
    const firstDay = getFirstDayOfMonth(selectedYear, monthIndex);
    const days = [];

    for (let index = 0; index < firstDay; index += 1) {
      days.push(<div key={`empty-${monthIndex}-${index}`} className="enterprise-calendar-day empty" />);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateStr = `${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const holiday = findHoliday(selectedYear, monthIndex, day);
      const birthdayList = findBirthdays(selectedYear, monthIndex, day);
      const dayLeaves = findApprovedLeaves(dateStr);
      const today = isToday(selectedYear, monthIndex, day);
      const isWeekend = [0, 6].includes(new Date(selectedYear, monthIndex, day).getDay());

      const classNames = ["enterprise-calendar-day"];
      if (isWeekend) classNames.push("is-weekend");
      if (today) classNames.push("is-today");
      if (holiday) classNames.push(`is-holiday-${holiday.type}`);
      if (birthdayList.length > 0) classNames.push("has-birthday");
      if (dayLeaves.length > 0) classNames.push("has-approved-leave");
      if (focusedDate === dateStr) classNames.push("is-selected");

      const title = [
        holiday ? `Holiday: ${holiday.name}` : null,
        birthdayList.length > 0
          ? `Birthday: ${birthdayList
              .map((birthday) => (birthday.isCurrentUser ? `${birthday.name} (You)` : birthday.name))
              .join(", ")}`
          : null,
        dayLeaves.length > 0
          ? `Approved leave: ${dayLeaves.map((leave) => leave.leave_type || "Leave").join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");

      const leaveBadgeLabel =
        dayLeaves.length > 0
          ? [...new Set(dayLeaves.map((leave) => getLeaveTypeShortLabel(leave.leave_type)))].join("/")
          : "";

      days.push(
        <button
          key={`${monthIndex}-${day}`}
          type="button"
          className={classNames.join(" ")}
          title={title}
          onClick={() => {
            if (dayLeaves.length > 0) {
              openLeaveDay(dateStr);
            }
          }}
        >
          <span className="enterprise-calendar-day-number">{day}</span>
          <div className="enterprise-calendar-day-icons">
            {dayLeaves.length > 0 ? <b>{leaveBadgeLabel}</b> : null}
            {birthdayList.length > 0 ? <i>🎂</i> : null}
          </div>
        </button>
      );
    }

    return (
      <article key={monthNames[monthIndex]} className="enterprise-calendar-month-card">
        <div className="enterprise-calendar-month-header">
          {monthNames[monthIndex]} {selectedYear}
        </div>
        <div className="enterprise-calendar-month-body">
          <div className="enterprise-calendar-weekdays">
            {weekdayNames.map((dayName) => (
              <div key={dayName.label} className={dayName.isWeekend ? "is-weekend" : ""}>
                {dayName.label}
              </div>
            ))}
          </div>
          <div className="enterprise-calendar-days">{days}</div>
        </div>
      </article>
    );
  };

  if (loading) {
    return (
      <section className="enterprise-calendar-workspace">
        <div className="fiori-loading-card">
          <CalendarDays size={28} />
          <div>
            <strong>Loading calendar</strong>
            <p>Preparing holidays, birthdays, approved leaves, and the yearly view.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="enterprise-calendar-workspace">
      <header className="admin-hero">
        <div>
          <div className="admin-section-overline">Calendar</div>
          <h1>Calendar</h1>
        </div>

        <div className="admin-hero-meta">
          <div className="admin-hero-meta-item">
            <span>Year</span>
            <strong>{selectedYear}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Holidays</span>
            <strong>{holidays.length}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Approved leave days</span>
            <strong>{approvedLeaves.length}</strong>
          </div>
        </div>
      </header>

      <section className="calendar-summary-grid">
        <article
          className="fiori-stat-card is-actionable"
          onClick={() => scrollToSection("calendar-holiday-list")}
          onKeyDown={(event) => handleCardKeyDown(event, () => scrollToSection("calendar-holiday-list"))}
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Public Holidays</span>
            <CalendarDays size={18} />
          </div>
          <div className="fiori-stat-value">{publicHolidays.length}</div>
          <div className="fiori-stat-note">Public holidays configured for the selected year</div>
        </article>

        <article
          className="fiori-stat-card is-actionable"
          onClick={() => scrollToSection("calendar-holiday-list")}
          onKeyDown={(event) => handleCardKeyDown(event, () => scrollToSection("calendar-holiday-list"))}
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Optional Holidays</span>
            <Sparkles size={18} />
          </div>
          <div className="fiori-stat-value">{optionalHolidays.length}</div>
          <div className="fiori-stat-note">Optional holidays visible in the current calendar scope</div>
        </article>

        <article
          className="fiori-stat-card is-actionable"
          onClick={() => scrollToSection("calendar-birthday-list")}
          onKeyDown={(event) => handleCardKeyDown(event, () => scrollToSection("calendar-birthday-list"))}
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Birthday Visibility</span>
            <Cake size={18} />
          </div>
          <div className="fiori-stat-value calendar-stat-text">{getBirthdayVisibilityMessage()}</div>
          <div className="fiori-stat-note">Birthdays shown based on your role and reporting scope</div>
        </article>

        <article
          className="fiori-stat-card is-actionable"
          onClick={() => setSection?.("leaves", { source: "calendar-summary", historyFilterStatus: "approved" })}
          onKeyDown={(event) =>
            handleCardKeyDown(event, () =>
              setSection?.("leaves", { source: "calendar-summary", historyFilterStatus: "approved" })
            )
          }
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Approved Leaves</span>
            <Sparkles size={18} />
          </div>
          <div className="fiori-stat-value">{approvedLeaveList.length}</div>
          <div className="fiori-stat-note">Approved requests highlighted on the calendar in red</div>
        </article>
      </section>

      <section className="fiori-panel">
        <div className="fiori-panel-header">
          <div>
            <h3>Calendar Controls</h3>
            <p>Switch years, refresh data, and show or hide birthdays and leaves</p>
          </div>
          <button
            type="button"
            className="fiori-button secondary"
            onClick={() => setShowControls((previous) => !previous)}
            aria-expanded={showControls}
            aria-controls="calendar-controls-body"
          >
            {showControls ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span>{showControls ? "Collapse" : "Expand"}</span>
          </button>
        </div>

        {showControls ? (
          <div id="calendar-controls-body">
            <div className="calendar-toolbar">
              <div className="calendar-year-controls">
                <button className="fiori-button secondary" onClick={() => setSelectedYear(selectedYear - 1)}>
                  <ChevronLeft size={16} />
                  <span>{selectedYear - 1}</span>
                </button>
                <ValueHelpSelect
                  value={selectedYear}
                  onChange={(value) => setSelectedYear(Number(value))}
                  searchPlaceholder="Search years"
                  style={{ width: 128 }}
                  options={yearOptions.map((year) => ({ value: year, label: year }))}
                />
                <button className="fiori-button secondary" onClick={() => setSelectedYear(selectedYear + 1)}>
                  <span>{selectedYear + 1}</span>
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="calendar-toolbar-actions">
                <label className="calendar-birthday-toggle">
                  <input
                    type="checkbox"
                    checked={showBirthdays}
                    onChange={(event) => setShowBirthdays(event.target.checked)}
                  />
                  <span>Show birthdays</span>
                </label>
                <label className="calendar-birthday-toggle">
                  <input
                    type="checkbox"
                    checked={showLeaves}
                    onChange={(event) => setShowLeaves(event.target.checked)}
                  />
                  <span>Show leaves</span>
                </label>
                <button className="fiori-button secondary" onClick={fetchData}>
                  <RefreshCw size={16} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {error && <div className="calendar-inline-error">{error}</div>}

            <div className="calendar-legend">
              <span><i className="is-public" /> Public holiday</span>
              <span><i className="is-optional" /> Optional holiday</span>
              <span><i className="is-company" /> Company holiday</span>
              {showLeaves ? <span><i className="is-approved-leave" /> Approved leave</span> : null}
              <span><i className="is-today" /> Today</span>
              <span><i className="is-birthday" /> Birthday</span>
            </div>
          </div>
        ) : null}
      </section>

      <div className="enterprise-calendar-grid">
        {monthNames.map((_, monthIndex) => renderMonth(monthIndex))}
      </div>

      <section className="enterprise-calendar-details-grid">
        {showLeaves && (
          <section className="fiori-panel" id="calendar-approved-leaves">
            <div className="fiori-panel-header">
              <div>
                <h3>Approved leave list</h3>
                <p>Click any approved leave to open the filtered leave page for that date.</p>
              </div>
            </div>

            {approvedLeaveList.length === 0 ? (
              <div className="admin-empty-state">
                <CalendarDays size={24} />
                <div>
                  <strong>No approved leaves for {selectedYear}</strong>
                  <p>Your approved leave requests will appear here after approval.</p>
                </div>
              </div>
            ) : (
              <div className="calendar-list">
                {approvedLeaveList.map((leave) => {
                  const rangeStart = leave.approved_start_date || leave.start_date;
                  const rangeEnd = leave.approved_end_date || leave.end_date;

                  return (
                    <button
                      key={`${leave._id}-${rangeStart}`}
                      type="button"
                      className="calendar-list-card calendar-list-card-button"
                      onClick={() => openLeaveDay(toDateKey(rangeStart))}
                    >
                      <div>
                        <strong>{leave.leave_type || "Leave"}</strong>
                        <p>
                          {formatMonthLabel(rangeStart)} {toDateKey(rangeStart)} to {toDateKey(rangeEnd)}
                        </p>
                      </div>
                      <div className="calendar-list-meta">
                        <span>{leave.days || leave.approved_days || 1} day(s)</span>
                        <span className="fiori-status-pill is-rejected">Approved leave</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="fiori-panel" id="calendar-holiday-list">
          <div className="fiori-panel-header">
            <div>
              <h3>Holiday List</h3>
              <p>Chronological view of the holidays configured for {selectedYear}</p>
            </div>
          </div>

          {sortedHolidays.length === 0 ? (
            <div className="admin-empty-state">
              <CalendarDays size={24} />
              <div>
                <strong>No holidays configured for {selectedYear}</strong>
                <p>Admins can add holidays from the Holiday Calendar workspace.</p>
              </div>
            </div>
          ) : (
            <div className="calendar-list">
              {sortedHolidays.map((holiday) => (
                <article key={`${holiday.date}-${holiday.name}`} className="calendar-list-card">
                  <div>
                    <strong>{holiday.name}</strong>
                    <p>{holiday.description || "No additional description"}</p>
                  </div>
                  <div className="calendar-list-meta">
                    <span>{holiday.date}</span>
                    <span className="fiori-status-pill is-neutral">{holiday.type}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {showBirthdays && (
          <section className="fiori-panel" id="calendar-birthday-list">
            <div className="fiori-panel-header">
              <div>
                <h3>Birthday List</h3>
                <p>{getBirthdayVisibilityMessage()}</p>
              </div>
            </div>

            {sortedBirthdays.length === 0 ? (
              <div className="admin-empty-state">
                <Cake size={24} />
                <div>
                  <strong>No birthdays visible for the selected year</strong>
                  <p>Birthday data appears here based on your access scope.</p>
                </div>
              </div>
            ) : (
              <div className="calendar-list">
                {sortedBirthdays.map((birthday) => (
                  <article key={`${birthday.employeeId}-${birthday.date}`} className="calendar-list-card">
                    <div>
                      <strong>
                        {birthday.name}
                        {birthday.isCurrentUser ? " (You)" : ""}
                      </strong>
                      <p>ID: {birthday.employeeId}</p>
                    </div>
                    <div className="calendar-list-meta">
                      <span>{birthday.date}</span>
                      <span className="fiori-status-pill is-pending">Birthday</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </section>
    </section>
  );
};

export default Calendar;
