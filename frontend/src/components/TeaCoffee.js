import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  CalendarDays,
  Coffee,
  CupSoda,
  Download,
  ListChecks,
  Milk,
  RefreshCw,
  Sandwich,
  ShieldBan,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import ValueHelpSelect from "./ValueHelpSelect";
import ValueHelpSearch from "./ValueHelpSearch";
import "../App.css";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api/tea_coffee`;
const MORNING_CUTOFF = "10:30";
const EVENING_CUTOFF = "14:30";
const EMPLOYEE_HISTORY_PAGE_SIZE = 6;
const BEVERAGE_OPTIONS = ["tea", "coffee", "milk"];
const ADMIN_TABS = [
  { key: "daily", label: "Daily demand" },
  { key: "guest", label: "Guest orders" },
  { key: "history", label: "Order history" },
  { key: "availability", label: "Availability" },
];

const buildSearchSuggestions = (items, fields) => {
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

const toISODate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const generateDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) return [];

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const normalizedStart = start <= end ? start : end;
  const normalizedEnd = start <= end ? end : start;
  const dateList = [];
  const cursor = new Date(normalizedStart);

  while (cursor <= normalizedEnd) {
    dateList.push(toISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dateList;
};

const downloadCsv = (filename, headers, rows) => {
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const getBeverageIcon = (beverage) => {
  switch (beverage) {
    case "tea":
      return "Tea";
    case "coffee":
      return "Coffee";
    case "milk":
      return "Milk";
    default:
      return "";
  }
};

const getBeverageGlyph = (beverage) => {
  switch (beverage) {
    case "tea":
      return <CupSoda size={16} />;
    case "coffee":
      return <Coffee size={16} />;
    case "milk":
      return <Milk size={16} />;
    default:
      return null;
  }
};

const formatDateLabel = (dateStr) => {
  const date = new Date(dateStr);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return {
    day: days[date.getDay()],
    date: date.getDate(),
    month: months[date.getMonth()],
    full: `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`,
  };
};

const BeveragePill = ({ beverage, locked = false }) => {
  if (!beverage) return null;

  return (
    <span className={`tea-beverage-pill ${locked ? "is-locked" : ""}`}>
      {getBeverageGlyph(beverage)}
      <span>{getBeverageIcon(beverage)}</span>
      {locked ? <span className="tea-beverage-lock">Locked</span> : null}
    </span>
  );
};

const SlotSelector = ({ label, cutoff, value, locked, onToggle }) => (
  <div className="tea-slot-section">
    <div className="tea-slot-header">
      <strong>{label}</strong>
      <span>{cutoff}</span>
      {locked ? <em>Cutoff passed</em> : null}
    </div>
    <div className="tea-option-row">
      {BEVERAGE_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={`tea-option-chip ${value === option ? "is-selected" : ""}`}
          onClick={() => onToggle(option)}
          disabled={locked}
        >
          {getBeverageGlyph(option)}
          <span>{getBeverageIcon(option)}</span>
        </button>
      ))}
    </div>
  </div>
);

const YearlyCalendarModal = ({ onClose, blockedDates, onBlockDate, onUnblockDate }) => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDateToBlock, setSelectedDateToBlock] = useState(null);
  const [blockReason, setBlockReason] = useState("");

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const isDateBlocked = (date) => blockedDates.some((item) => item.date === date);

  const getBlockReason = (date) => blockedDates.find((item) => item.date === date)?.reason || "";

  const handleDateClick = (dateStr) => {
    if (isDateBlocked(dateStr)) {
      if (window.confirm(`Unblock ${dateStr}?\nReason: ${getBlockReason(dateStr)}`)) {
        onUnblockDate(dateStr);
      }
      return;
    }

    setSelectedDateToBlock(dateStr);
  };

  const renderMonth = (monthIndex) => {
    const firstDay = new Date(selectedYear, monthIndex, 1);
    const lastDay = new Date(selectedYear, monthIndex + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const cells = [];

    for (let index = 0; index < startingDayOfWeek; index += 1) {
      cells.push(<div key={`empty-${monthIndex}-${index}`} className="tea-block-cell empty" />);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateStr = `${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const blocked = isDateBlocked(dateStr);
      const weekday = new Date(selectedYear, monthIndex, day).getDay();
      const isWeekend = weekday === 0 || weekday === 6;

      cells.push(
        <button
          key={dateStr}
          type="button"
          className={`tea-block-cell ${blocked ? "is-blocked" : ""} ${isWeekend ? "is-weekend" : ""}`}
          onClick={() => !isWeekend && handleDateClick(dateStr)}
          title={blocked ? `Blocked: ${getBlockReason(dateStr)}` : isWeekend ? "Weekend" : "Click to block"}
          disabled={isWeekend}
        >
          {day}
        </button>
      );
    }

    return (
      <article key={months[monthIndex]} className="tea-block-month">
        <h4>{months[monthIndex]}</h4>
        <div className="tea-block-weekdays">
          {["S", "M", "T", "W", "T", "F", "S"].map((day) => (
            <span key={`${months[monthIndex]}-${day}`}>{day}</span>
          ))}
        </div>
        <div className="tea-block-grid">{cells}</div>
      </article>
    );
  };

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal admin-modal-wide">
        <div className="admin-modal-header">
          <div>
            <h2>Manage Blocked Dates</h2>
            <p>Block or unblock tea and coffee service dates. Weekends stay unavailable automatically.</p>
          </div>
          <div className="tea-modal-topbar">
            <button className="fiori-button secondary" onClick={() => setSelectedYear(selectedYear - 1)}>
              {selectedYear - 1}
            </button>
            <span className="tea-year-label">{selectedYear}</span>
            <button className="fiori-button secondary" onClick={() => setSelectedYear(selectedYear + 1)}>
              {selectedYear + 1}
            </button>
            <button className="fiori-button secondary danger" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="tea-block-month-grid">
          {months.map((_, monthIndex) => renderMonth(monthIndex))}
        </div>

        <div className="tea-block-legend">
          <span><i /> Available</span>
          <span><i className="is-blocked" /> Blocked</span>
          <span><i className="is-weekend" /> Weekend</span>
        </div>
      </div>

      {selectedDateToBlock ? (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <div>
                <h2>Block Date</h2>
                <p>{selectedDateToBlock}</p>
              </div>
            </div>

            <label className="fiori-form-field">
              <label>Reason</label>
              <input
                className="input"
                value={blockReason}
                onChange={(event) => setBlockReason(event.target.value)}
                placeholder="Holiday, maintenance, office closure"
                autoFocus
              />
            </label>

            <div className="admin-modal-actions">
              <button
                className="fiori-button secondary"
                onClick={() => {
                  setSelectedDateToBlock(null);
                  setBlockReason("");
                }}
              >
                Cancel
              </button>
              <button
                className="fiori-button danger"
                onClick={() => {
                  onBlockDate(selectedDateToBlock, blockReason || "Unavailable");
                  setSelectedDateToBlock(null);
                  setBlockReason("");
                }}
              >
                Block date
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const EmployeeListModal = ({ date, orders, onClose }) => {
  const teaCount = orders.filter((item) => item.morning === "tea" || item.evening === "tea").length;
  const coffeeCount = orders.filter((item) => item.morning === "coffee" || item.evening === "coffee").length;
  const milkCount = orders.filter((item) => item.morning === "milk" || item.evening === "milk").length;

  const exportOrders = () => {
    downloadCsv(
      `tea_coffee_orders_${date}.csv`,
      ["Date", "Employee Name", "Employee Email", "Morning", "Evening"],
      orders.map((order) => [
        date,
        order.employee_name || "",
        order.employee_email || "",
        order.morning || "",
        order.evening || "",
      ])
    );
  };

  return (
    <div className="admin-modal-overlay">
      <div className="admin-modal admin-modal-wide">
        <div className="admin-modal-header">
          <div>
            <h2>Employee Orders</h2>
            <p>{formatDateLabel(date).full} • {orders.length} orders</p>
          </div>
          <div className="tea-toolbar">
            <button className="fiori-button secondary" onClick={exportOrders} disabled={!orders.length}>
              <Download size={16} />
              <span>Export CSV</span>
            </button>
            <button className="fiori-button secondary danger" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="tea-employee-summary">
          <article className="fiori-stat-card">
            <div className="fiori-stat-label">Tea</div>
            <div className="fiori-stat-value">{teaCount}</div>
          </article>
          <article className="fiori-stat-card">
            <div className="fiori-stat-label">Coffee</div>
            <div className="fiori-stat-value">{coffeeCount}</div>
          </article>
          <article className="fiori-stat-card">
            <div className="fiori-stat-label">Milk</div>
            <div className="fiori-stat-value">{milkCount}</div>
          </article>
        </div>

        {orders.length === 0 ? (
          <div className="admin-empty-state">
            <Users size={24} />
            <div>
              <strong>No employee orders for this date</strong>
              <p>Orders will appear here once the team places them.</p>
            </div>
          </div>
        ) : (
          <div className="fiori-table-shell">
            <table className="fiori-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Morning</th>
                  <th>Evening</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order, index) => (
                  <tr key={`${order.employee_email}-${index}`}>
                    <td>
                      <div className="fiori-primary-cell">
                        <strong>{order.employee_name}</strong>
                        <span>{order.employee_email}</span>
                      </div>
                    </td>
                    <td>{order.morning ? <BeveragePill beverage={order.morning} /> : "—"}</td>
                    <td>{order.evening ? <BeveragePill beverage={order.evening} /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const AdminView = ({
  dates,
  orders,
  historyOrders,
  blockedDates,
  onBlockDate,
  onUnblockDate,
  onRefresh,
  filters,
  onFilterChange,
  historyFilters,
  onHistoryFilterChange,
  onExportHistory,
  onGuestOrder,
}) => {
  const [showYearlyCalendar, setShowYearlyCalendar] = useState(false);
  const [selectedDateForList, setSelectedDateForList] = useState(null);
  const [activeTab, setActiveTab] = useState("daily");
  const [guestOrder, setGuestOrder] = useState({
    date: toISODate(new Date()),
    guest_name: "Guest",
    beverage: "tea",
    beverage_quantity: 1,
    snack_name: "",
    snack_quantity: 0,
    notes: "",
  });

  const getStats = useCallback(
    (date) => {
      const dayOrders = orders[date] || [];

      return dayOrders.reduce(
        (accumulator, order) => {
          const beverageCount = order.order_type === "guest" ? Number(order.guest_beverage_quantity || 1) : 1;
          if (order.morning === "tea") accumulator.morningTea += beverageCount;
          if (order.morning === "coffee") accumulator.morningCoffee += beverageCount;
          if (order.morning === "milk") accumulator.morningMilk += beverageCount;
          if (order.evening === "tea") accumulator.eveningTea += 1;
          if (order.evening === "coffee") accumulator.eveningCoffee += 1;
          if (order.evening === "milk") accumulator.eveningMilk += 1;
          accumulator.total += 1;
          return accumulator;
        },
        {
          morningTea: 0,
          morningCoffee: 0,
          morningMilk: 0,
          eveningTea: 0,
          eveningCoffee: 0,
          eveningMilk: 0,
          total: 0,
        }
      );
    },
    [orders]
  );

  const isBlocked = useCallback(
    (date) => blockedDates.some((item) => item.date === date),
    [blockedDates]
  );

  const getBlockReason = useCallback(
    (date) => blockedDates.find((item) => item.date === date)?.reason || "",
    [blockedDates]
  );

  const summaryStats = useMemo(() => {
    return dates.reduce(
      (accumulator, order) => {
        const stats = getStats(order);
        accumulator.totalOrders += stats.total;
        if (isBlocked(order)) accumulator.blockedDays += 1;
        if (stats.total > 0) accumulator.activeDays += 1;
        return accumulator;
      },
      { totalOrders: 0, blockedDays: 0, activeDays: 0 }
    );
  }, [dates, getStats, isBlocked]);

  const guestOrders = useMemo(
    () => historyOrders.filter((order) => order.order_type === "guest"),
    [historyOrders]
  );
  const snackCount = guestOrders.reduce((sum, order) => sum + Number(order.snack_quantity || 0), 0);

  const filteredDates = useMemo(() => {
    return dates.filter((date) => {
      if (filters.dateFrom && date < filters.dateFrom) return false;
      if (filters.dateTo && date > filters.dateTo) return false;

      if (!filters.beverageType || filters.beverageType === "all") {
        return true;
      }

      const dayOrders = orders[date] || [];
      return dayOrders.some(
        (order) =>
          order.morning === filters.beverageType || order.evening === filters.beverageType
      );
    });
  }, [dates, filters.beverageType, filters.dateFrom, filters.dateTo, orders]);
  const availableDepartments = useMemo(
    () => ["all", ...new Set(historyOrders.map((order) => order.employee_department).filter(Boolean))],
    [historyOrders]
  );
  const historySearchSuggestions = useMemo(
    () =>
      buildSearchSuggestions(historyOrders, [
        "employee_name",
        "employee_email",
        "employee_department",
        "employee_designation",
        "date",
      ]),
    [historyOrders]
  );

  const filteredHistoryOrders = useMemo(() => {
    const search = (historyFilters.search || "").trim().toLowerCase();

    return historyOrders.filter((order) => {
      if (historyFilters.dateFrom && order.date < historyFilters.dateFrom) return false;
      if (historyFilters.dateTo && order.date > historyFilters.dateTo) return false;

      if (historyFilters.department !== "all" && order.employee_department !== historyFilters.department) {
        return false;
      }

      if (historyFilters.beverageType !== "all") {
        const matchesBeverage =
          order.morning === historyFilters.beverageType ||
          order.evening === historyFilters.beverageType ||
          order.guest_beverage === historyFilters.beverageType;
        if (!matchesBeverage) return false;
      }

      if (!search) return true;

      return [
        order.employee_name,
        order.employee_email,
        order.employee_department,
        order.employee_designation,
        order.date,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [historyFilters, historyOrders]);

  const exportSummary = () => {
    downloadCsv(
      `tea_coffee_summary_${filters.dateFrom || "start"}_${filters.dateTo || "end"}.csv`,
      [
        "Date",
        "Blocked",
        "Reason",
        "Total Orders",
        "Employee Names",
        "Morning Orders By Employee",
        "Evening Orders By Employee",
        "Morning Tea",
        "Morning Coffee",
        "Morning Milk",
        "Evening Tea",
        "Evening Coffee",
        "Evening Milk",
      ],
      filteredDates.map((date) => {
        const stats = getStats(date);
        const dayOrders = orders[date] || [];
        const employeeNames = Array.from(
          new Set(dayOrders.map((order) => order.employee_name).filter(Boolean))
        ).join(" | ");
        const morningOrders = dayOrders
          .filter((order) => order.morning)
          .map((order) => {
            const quantity =
              order.order_type === "guest" && Number(order.guest_beverage_quantity || 0) > 1
                ? ` x${order.guest_beverage_quantity}`
                : "";
            return `${order.employee_name || "Unknown"}: ${getBeverageIcon(order.morning)}${quantity}`;
          })
          .join(" | ");
        const eveningOrders = dayOrders
          .filter((order) => order.evening)
          .map((order) => `${order.employee_name || "Unknown"}: ${getBeverageIcon(order.evening)}`)
          .join(" | ");
        return [
          date,
          isBlocked(date) ? "Yes" : "No",
          getBlockReason(date),
          stats.total,
          employeeNames,
          morningOrders,
          eveningOrders,
          stats.morningTea,
          stats.morningCoffee,
          stats.morningMilk,
          stats.eveningTea,
          stats.eveningCoffee,
          stats.eveningMilk,
        ];
      })
    );
  };

  const DayCard = ({ date, large = false }) => {
    const stats = getStats(date);
    const label = formatDateLabel(date);
    const blocked = isBlocked(date);

    return (
      <article className={`tea-admin-day-card ${large ? "is-large" : ""} ${blocked ? "is-blocked" : ""}`}>
        <div className="tea-admin-day-top">
          <div>
            <h3>{label.full}</h3>
            <p>{date}</p>
          </div>
          {blocked ? <span className="fiori-status-pill is-rejected">Blocked</span> : null}
        </div>

        {blocked ? (
          <div className="tea-admin-block-reason">{getBlockReason(date) || "Unavailable"}</div>
        ) : (
          <>
            <div className="tea-admin-total">
              <div>
                <span>Total Orders</span>
                <strong>{stats.total}</strong>
              </div>
              <button className="fiori-button secondary" onClick={() => setSelectedDateForList(date)}>
                View employee list
              </button>
            </div>

            <div className="tea-admin-slot-grid">
              <div className="tea-admin-slot-card">
                <strong>Morning</strong>
                <div className="tea-admin-metric-grid">
                  <div><span>Tea</span><b>{stats.morningTea}</b></div>
                  <div><span>Coffee</span><b>{stats.morningCoffee}</b></div>
                  <div><span>Milk</span><b>{stats.morningMilk}</b></div>
                </div>
              </div>

              <div className="tea-admin-slot-card">
                <strong>Evening</strong>
                <div className="tea-admin-metric-grid">
                  <div><span>Tea</span><b>{stats.eveningTea}</b></div>
                  <div><span>Coffee</span><b>{stats.eveningCoffee}</b></div>
                  <div><span>Milk</span><b>{stats.eveningMilk}</b></div>
                </div>
              </div>
            </div>
          </>
        )}
      </article>
    );
  };

  return (
    <section className="tea-workspace">
      <header className="admin-hero">
        <div className="admin-hero-copy">
          <div className="admin-section-overline">Hospitality Operations</div>
          <h1>Tea and Coffee</h1>
          <p>
            Manage employee orders, guest requests, and service availability from a clean hospitality workspace.
          </p>
        </div>

        <div className="admin-hero-meta">
          <div className="admin-hero-meta-item">
            <span>Primary View</span>
            <strong>Hospitality workspace</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Built For</span>
            <strong>Daily operations</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Includes</span>
            <strong>Demand, guests, history</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Outcome</span>
            <strong>Smoother service planning</strong>
          </div>
        </div>
      </header>

      <nav className="page-subtab-strip" aria-label="Tea and coffee admin sections">
        {ADMIN_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`page-subtab-button ${activeTab === tab.key ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="tea-summary-grid" style={{ display: activeTab === "daily" ? undefined : "none" }}>
        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Service Window</span>
            <ShoppingBag size={18} />
          </div>
          <div className="fiori-stat-value tea-stat-text">{filteredDates.length} Days</div>
          <div className="fiori-stat-note">
            {filters.dateFrom} to {filters.dateTo}
          </div>
        </article>

        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Blocked Dates</span>
            <ShieldBan size={18} />
          </div>
          <div className="fiori-stat-value">{summaryStats.blockedDays}</div>
          <div className="fiori-stat-note">Dates currently unavailable for beverage service</div>
        </article>

        <article className="fiori-stat-card is-actionable" onClick={() => setShowYearlyCalendar(true)}>
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Manage Availability</span>
            <CalendarDays size={18} />
          </div>
          <div className="fiori-stat-value tea-stat-text">Open</div>
          <div className="fiori-inline-link">Block or unblock service dates</div>
        </article>
      </section>

      <section className="fiori-panel" style={{ display: activeTab === "daily" ? undefined : "none" }}>
        <div className="fiori-panel-header">
          <div>
            <h3>Controls</h3>
            <p>Filter the admin view by beverage and date range, then export the current table.</p>
          </div>
          <div className="tea-toolbar">
            <button className="fiori-button secondary" onClick={onRefresh}>
              <RefreshCw size={16} />
              <span>Refresh orders</span>
            </button>
            <button className="fiori-button secondary" onClick={exportSummary} disabled={!filteredDates.length}>
              <Download size={16} />
              <span>Export CSV</span>
            </button>
            <button className="fiori-button primary" onClick={() => setShowYearlyCalendar(true)}>
              <CalendarDays size={16} />
              <span>Manage blocked dates</span>
            </button>
          </div>
        </div>

        <div className="employee-directory-filters employee-directory-filters-extended">
          <label className="employee-filter-field">
            <span>Date From</span>
            <input
              className="input"
              type="date"
              value={filters.dateFrom}
              onChange={(event) => onFilterChange("dateFrom", event.target.value)}
            />
          </label>

          <label className="employee-filter-field">
            <span>Date To</span>
            <input
              className="input"
              type="date"
              value={filters.dateTo}
              onChange={(event) => onFilterChange("dateTo", event.target.value)}
            />
          </label>

          <label className="employee-filter-field">
            <span>Beverage Type</span>
            <ValueHelpSelect
              value={filters.beverageType}
              onChange={(value) => onFilterChange("beverageType", value)}
              searchPlaceholder="Search beverages"
              options={[
                { value: "all", label: "All beverages" },
                { value: "tea", label: "Tea" },
                { value: "coffee", label: "Coffee" },
                { value: "milk", label: "Milk" },
              ]}
            />
          </label>
        </div>
      </section>

      {activeTab === "daily" && filteredDates[0] ? <DayCard date={filteredDates[0]} large /> : null}

      <section className="fiori-panel" style={{ display: activeTab === "daily" ? undefined : "none" }}>
        <div className="fiori-panel-header">
          <div>
            <h3>Upcoming Days</h3>
            <p>Daily demand cards for the current filtered service window</p>
          </div>
        </div>

        <div className="tea-admin-grid">
          {filteredDates.slice(1).map((date) => (
            <DayCard key={date} date={date} />
          ))}
        </div>
      </section>

      <section className="fiori-panel" style={{ display: activeTab === "guest" ? undefined : "none" }}>
        <div className="fiori-panel-header">
          <div>
            <h3>Guest Orders</h3>
            <p>Order tea, coffee, milk, and snacks for guests or meeting rooms.</p>
          </div>
          <span className="fiori-status-pill is-neutral">{guestOrders.length} guest orders</span>
        </div>

        <div className="projects-summary-grid">
          <article className="fiori-stat-card">
            <div className="fiori-stat-topline">
              <span className="fiori-stat-label">Guest Orders</span>
              <Users size={18} />
            </div>
            <div className="fiori-stat-value">{guestOrders.length}</div>
            <div className="fiori-stat-note">Current history window</div>
          </article>
          <article className="fiori-stat-card">
            <div className="fiori-stat-topline">
              <span className="fiori-stat-label">Snack Portions</span>
              <Sandwich size={18} />
            </div>
            <div className="fiori-stat-value">{snackCount}</div>
            <div className="fiori-stat-note">Guest snack demand</div>
          </article>
        </div>

        <br></br>

        <div className="employee-directory-filters employee-directory-filters-extended">
          <label className="employee-filter-field">
            <span>Date</span>
            <input className="input" type="date" value={guestOrder.date} onChange={(event) => setGuestOrder((previous) => ({ ...previous, date: event.target.value }))} />
          </label>
          <label className="employee-filter-field">
            <span>Guest / Meeting</span>
            <input className="input" value={guestOrder.guest_name} onChange={(event) => setGuestOrder((previous) => ({ ...previous, guest_name: event.target.value }))} placeholder="Guest, visitor name, or meeting" />
          </label>
          <label className="employee-filter-field">
            <span>Beverage</span>
            <ValueHelpSelect
              value={guestOrder.beverage}
              onChange={(value) => setGuestOrder((previous) => ({ ...previous, beverage: value }))}
              searchPlaceholder="Search beverages"
              options={[
                { value: "", label: "No beverage" },
                { value: "tea", label: "Tea" },
                { value: "coffee", label: "Coffee" },
                { value: "milk", label: "Milk" },
              ]}
            />
          </label>
          <label className="employee-filter-field">
            <span>Beverage Qty</span>
            <input className="input" type="number" min="0" value={guestOrder.beverage_quantity} onChange={(event) => setGuestOrder((previous) => ({ ...previous, beverage_quantity: event.target.value }))} />
          </label>
          <label className="employee-filter-field">
            <span>Snack Name</span>
            <input className="input" value={guestOrder.snack_name} onChange={(event) => setGuestOrder((previous) => ({ ...previous, snack_name: event.target.value }))} placeholder="Samosa, sandwich, biscuits..." />
          </label>
          <label className="employee-filter-field">
            <span>Snack Qty</span>
            <input className="input" type="number" min="0" value={guestOrder.snack_quantity} onChange={(event) => setGuestOrder((previous) => ({ ...previous, snack_quantity: event.target.value }))} />
          </label>
          <label className="employee-filter-field employee-filter-search">
            <span>Notes</span>
            <input className="input" value={guestOrder.notes} onChange={(event) => setGuestOrder((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Board room, client visit, event notes" />
          </label>
        </div>

        <div className="admin-modal-actions">
          <button
            className="fiori-button primary"
            onClick={() =>
              onGuestOrder(guestOrder).then(() =>
                setGuestOrder({
                  date: toISODate(new Date()),
                  guest_name: "Guest",
                  beverage: "tea",
                  beverage_quantity: 1,
                  snack_name: "",
                  snack_quantity: 0,
                  notes: "",
                })
              )
            }
          >
            Place guest order
          </button>
        </div>

        <div className="fiori-table-shell">
          <table className="fiori-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Guest</th>
                <th>Beverage</th>
                <th>Snacks</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {guestOrders.length ? guestOrders.map((order) => (
                <tr key={order._id}>
                  <td>{order.date}</td>
                  <td>{order.employee_name || "Guest"}</td>
                  <td>{order.guest_beverage ? `${getBeverageIcon(order.guest_beverage)} x ${order.guest_beverage_quantity || 1}` : "—"}</td>
                  <td>{order.snack_name ? `${order.snack_name} x ${order.snack_quantity || 1}` : "—"}</td>
                  <td>{order.notes || "—"}</td>
                </tr>
              )) : (
                <tr><td colSpan={5}>No guest orders in the current history window</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="fiori-panel" style={{ display: activeTab === "history" ? undefined : "none" }}>
        <div className="fiori-panel-header">
          <div>
            <h3>Past Orders Table</h3>
            <p>Historical tea and coffee orders already placed by employees.</p>
          </div>
          <button className="fiori-button secondary" onClick={onExportHistory} disabled={!historyOrders.length}>
            <Download size={16} />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="employee-directory-filters employee-directory-filters-extended">
          <label className="employee-filter-field employee-filter-search">
            <span>Person / Search</span>
            <ValueHelpSearch
              value={historyFilters.search}
              onChange={(value) => onHistoryFilterChange("search", value)}
              suggestions={historySearchSuggestions}
              placeholder="Search by person, email, department, designation, or date"
            />
          </label>

          <label className="employee-filter-field">
            <span>Department</span>
            <ValueHelpSelect
              value={historyFilters.department}
              onChange={(value) => onHistoryFilterChange("department", value)}
              searchPlaceholder="Search departments"
              options={availableDepartments.map((department) => ({
                value: department,
                label: department === "all" ? "All departments" : department,
              }))}
            />
          </label>

          <label className="employee-filter-field">
            <span>Beverage Type</span>
            <ValueHelpSelect
              value={historyFilters.beverageType}
              onChange={(value) => onHistoryFilterChange("beverageType", value)}
              searchPlaceholder="Search beverages"
              options={[
                { value: "all", label: "All beverages" },
                { value: "tea", label: "Tea" },
                { value: "coffee", label: "Coffee" },
                { value: "milk", label: "Milk" },
              ]}
            />
          </label>

          <label className="employee-filter-field">
            <span>History From</span>
            <input
              className="input"
              type="date"
              value={historyFilters.dateFrom}
              onChange={(event) => onHistoryFilterChange("dateFrom", event.target.value)}
            />
          </label>

          <label className="employee-filter-field">
            <span>History To</span>
            <input
              className="input"
              type="date"
              value={historyFilters.dateTo}
              onChange={(event) => onHistoryFilterChange("dateTo", event.target.value)}
            />
          </label>
        </div>

        <br></br>

        {filteredHistoryOrders.length === 0 ? (
          <div className="admin-empty-state">
            <Users size={24} />
            <div>
              <strong>No past tea/coffee orders match the current filters</strong>
              <p>Adjust person, beverage, department, or date filters to review more historical orders.</p>
            </div>
          </div>
        ) : (
          <div className="fiori-table-shell">
            <table className="fiori-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Morning</th>
                  <th>Evening</th>
                  <th>Snacks</th>
                  <th>Matched Beverage</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistoryOrders.map((order, index) => {
                  const matchesBeverage =
                    historyFilters.beverageType !== "all" &&
                    (order.morning === historyFilters.beverageType ||
                      order.evening === historyFilters.beverageType ||
                      order.guest_beverage === historyFilters.beverageType);
                  return (
                    <tr key={`${order._id || order.employee_email}-${order.date}-${index}`}>
                      <td>
                        <div className="fiori-primary-cell">
                          <strong>{formatDateLabel(order.date).full}</strong>
                          <span>{order.date}</span>
                        </div>
                      </td>
                      <td>
                        <div className="fiori-primary-cell">
                          <strong>{order.employee_name || "Unknown employee"}</strong>
                          <span>{order.employee_email || "No email available"}</span>
                          <span>{order.employee_designation || "Designation unavailable"}</span>
                        </div>
                      </td>
                      <td>{order.employee_department || "Unassigned"}</td>
                      <td>{order.morning ? <BeveragePill beverage={order.morning} /> : "—"}</td>
                      <td>{order.evening ? <BeveragePill beverage={order.evening} /> : "—"}</td>
                      <td>{order.snack_name ? `${order.snack_name} x ${order.snack_quantity || 1}` : "—"}</td>
                      <td>
                        {historyFilters.beverageType === "all" ? "All beverages" : matchesBeverage ? historyFilters.beverageType : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="fiori-panel" style={{ display: activeTab === "availability" ? undefined : "none" }}>
        <div className="fiori-panel-header">
          <div>
            <h3>Availability</h3>
            <p>Review blocked dates and open the yearly availability manager.</p>
          </div>
          <button className="fiori-button primary" onClick={() => setShowYearlyCalendar(true)}>
            <CalendarDays size={16} />
            <span>Manage blocked dates</span>
          </button>
        </div>
        <div className="fiori-table-shell">
          <table className="fiori-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reason</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {blockedDates.length ? blockedDates.map((item) => (
                <tr key={item.date}>
                  <td>{item.date}</td>
                  <td>{item.reason || "Unavailable"}</td>
                  <td>{item.auto_blocked ? "Holiday sync" : "Manual block"}</td>
                </tr>
              )) : (
                <tr><td colSpan={3}>No blocked dates configured</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showYearlyCalendar ? (
        <YearlyCalendarModal
          onClose={() => setShowYearlyCalendar(false)}
          blockedDates={blockedDates}
          onBlockDate={onBlockDate}
          onUnblockDate={onUnblockDate}
        />
      ) : null}

      {selectedDateForList ? (
        <EmployeeListModal
          date={selectedDateForList}
          orders={orders[selectedDateForList] || []}
          onClose={() => setSelectedDateForList(null)}
        />
      ) : null}
    </section>
  );
};

const TeaCoffee = ({ user, adminView = false }) => {
  const effectiveUser = adminView
    && !["Admin", "admin", "System Administrator", "Administrator", "system-admin"].includes((user?.role || "").trim())
    ? { ...user, role: "Admin" }
    : user;
  const [orders, setOrders] = useState({});
  const [historyOrders, setHistoryOrders] = useState([]);
  const [adminHistoryOrders, setAdminHistoryOrders] = useState([]);
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(false);
  const fetchedOnce = useRef(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelectedDates, setBulkSelectedDates] = useState([]);
  const [bulkSelection, setBulkSelection] = useState({ morning: null, evening: null });
  const [blockedDates, setBlockedDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [tempSelection, setTempSelection] = useState({ morning: null, evening: null });
  const [message, setMessage] = useState("");
  const [adminFilters, setAdminFilters] = useState(() => {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 14);
    return {
      dateFrom: toISODate(start),
      dateTo: toISODate(end),
      beverageType: "all",
    };
  });
  const [adminHistoryFilters, setAdminHistoryFilters] = useState(() => {
    const today = toISODate(new Date());
    return {
      search: "",
      department: "all",
      beverageType: "all",
      dateFrom: "",
      dateTo: today,
    };
  });
  const [employeeHistoryFilters, setEmployeeHistoryFilters] = useState(() => {
    const today = toISODate(new Date());
    return {
      beverageType: "all",
      dateFrom: "",
      dateTo: today,
    };
  });
  const [employeeHistoryPage, setEmployeeHistoryPage] = useState(1);

  const isAdmin = ["Admin", "admin", "System Administrator", "Administrator", "system-admin"].includes(
    (effectiveUser?.role || "").trim()
  );
  const userId = effectiveUser?._id || effectiveUser?.id;

  const showToast = (nextMessage) => {
    setMessage(nextMessage);
    window.setTimeout(() => setMessage(""), 3000);
  };

  const generateDates = useCallback((startDate, endDate) => {
    setDates(generateDateRange(startDate, endDate));
  }, []);

  const fetchBlockedDates = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/blocked_dates`);
      setBlockedDates(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching blocked dates:", error);
    }
  }, []);

  const fetchMyOrders = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const [upcomingResponse, historyResponse] = await Promise.all([
        axios.get(`${API_BASE}/my_orders/${userId}`),
        axios.get(`${API_BASE}/my_orders/${userId}`, {
          params: {
            include_past: true,
            end_date: toISODate(new Date()),
          },
        }),
      ]);
      const orderMap = {};
      upcomingResponse.data.forEach((order) => {
        orderMap[order.date] = order;
      });
      setOrders(orderMap);
      setHistoryOrders(Array.isArray(historyResponse.data) ? historyResponse.data : []);
    } catch (error) {
      console.error("Error fetching orders:", error);
      showToast(error.response?.data?.error || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const fetchAdminOrders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/admin/orders`, {
        params: {
          start_date: adminFilters.dateFrom,
          end_date: adminFilters.dateTo,
          beverage_type: adminFilters.beverageType,
        },
      });

      const orderMap = {};
      response.data.forEach((order) => {
        if (!orderMap[order.date]) {
          orderMap[order.date] = [];
        }
        orderMap[order.date].push(order);
      });
      setOrders(orderMap);
      generateDates(adminFilters.dateFrom, adminFilters.dateTo);

      const today = toISODate(new Date());
      const historyResponse = await axios.get(`${API_BASE}/admin/orders`, {
        params: {
          start_date: "2020-01-01",
          end_date: today,
          beverage_type: adminFilters.beverageType,
        },
      });
      setAdminHistoryOrders(Array.isArray(historyResponse.data) ? historyResponse.data : []);
    } catch (error) {
      console.error("Error fetching admin orders:", error);
      showToast(error.response?.data?.error || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [adminFilters.beverageType, adminFilters.dateFrom, adminFilters.dateTo, generateDates]);

  const handleAdminFilterChange = useCallback((field, value) => {
    setAdminFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const handleAdminHistoryFilterChange = useCallback((field, value) => {
    setAdminHistoryFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const handleGuestOrder = useCallback(async (guestOrder) => {
    try {
      const response = await axios.post(`${API_BASE}/admin/guest_order`, guestOrder);
      showToast(response.data.message || "Guest order placed successfully");
      await fetchAdminOrders();
    } catch (error) {
      showToast(error.response?.data?.error || "Failed to place guest order");
      throw error;
    }
  }, [fetchAdminOrders]);

  const handleEmployeeHistoryFilterChange = useCallback((field, value) => {
    setEmployeeHistoryFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const refreshOrders = useCallback(() => {
    if (isAdmin) {
      fetchAdminOrders();
    } else {
      fetchMyOrders();
    }
  }, [isAdmin, fetchAdminOrders, fetchMyOrders]);

  const handleBlockDate = async (date, reason) => {
    try {
      const response = await axios.post(`${API_BASE}/block_date`, { date, reason });
      showToast(response.data.message || "Date blocked successfully");
      fetchBlockedDates();
      refreshOrders();
    } catch (error) {
      showToast(error.response?.data?.error || "Failed to block date");
    }
  };

  const handleUnblockDate = async (date) => {
    if (!window.confirm("Are you sure you want to unblock this date?")) return;

    try {
      const response = await axios.delete(`${API_BASE}/unblock_date`, { data: { date } });
      showToast(response.data.message || "Date unblocked successfully");
      fetchBlockedDates();
    } catch (error) {
      showToast(error.response?.data?.error || "Failed to unblock date");
    }
  };

  useEffect(() => {
    if (fetchedOnce.current) return;
    fetchedOnce.current = true;

    fetchBlockedDates();

    if (isAdmin) {
      fetchAdminOrders();
    } else if (userId) {
      const start = new Date();
      const end = new Date();
      end.setDate(end.getDate() + 14);
      generateDates(toISODate(start), toISODate(end));
      fetchMyOrders();
    } else {
      showToast("User information is not available");
    }
  }, [isAdmin, userId, generateDates, fetchBlockedDates, fetchAdminOrders, fetchMyOrders]);

  useEffect(() => {
    if (!fetchedOnce.current || !isAdmin) return;
    fetchAdminOrders();
  }, [fetchAdminOrders, isAdmin]);

  const isDateBlocked = (date) => blockedDates.some((item) => item.date === date);

  const isPastCutoff = (date, slot) => {
    const today = new Date().toISOString().split("T")[0];
    if (date !== today) return false;

    const cutoffTime = slot === "morning" ? MORNING_CUTOFF : EVENING_CUTOFF;
    const [hours, minutes] = cutoffTime.split(":").map(Number);
    const cutoff = new Date();
    cutoff.setHours(hours, minutes, 0, 0);
    return new Date() >= cutoff;
  };

  const handleDateClick = (date) => {
    const day = new Date(date).getDay();
    const isWeekend = day === 0 || day === 6;
    if (isWeekend || isDateBlocked(date)) return;

    if (bulkMode) {
      setBulkSelectedDates((previous) =>
        previous.includes(date) ? previous.filter((item) => item !== date) : [...previous, date]
      );
      return;
    }

    const existing = orders[date] || {};
    setSelectedDate(date);
    setTempSelection({
      morning: existing.morning || null,
      evening: existing.evening || null,
    });
  };

  const handleSlotToggle = (slot, value) => {
    if (isPastCutoff(selectedDate, slot)) {
      showToast(`Cannot modify ${slot} order after ${slot === "morning" ? MORNING_CUTOFF : EVENING_CUTOFF}`);
      return;
    }

    setTempSelection((previous) => ({
      ...previous,
      [slot]: previous[slot] === value ? null : value,
    }));
  };

  const handleSubmit = async () => {
    if (!selectedDate || !userId) {
      showToast("Missing required information");
      return;
    }

    if (!tempSelection.morning && !tempSelection.evening) {
      showToast("Select at least one item");
      return;
    }

    try {
      const response = await axios.post(`${API_BASE}/place_order`, {
        employee_id: userId,
        date: selectedDate,
        morning: tempSelection.morning,
        evening: tempSelection.evening,
      });

      setOrders((previous) => ({
        ...previous,
        [selectedDate]: {
          date: selectedDate,
          morning: tempSelection.morning,
          evening: tempSelection.evening,
          employee_name: effectiveUser.name,
          employee_email: effectiveUser.email,
        },
      }));

      showToast(response.data.message || "Order submitted successfully");
      setSelectedDate(null);
      setTempSelection({ morning: null, evening: null });
      fetchMyOrders();
    } catch (error) {
      console.error("Error submitting order:", error);
      showToast(error.response?.data?.error || "Failed to submit order");
    }
  };

  const handleBulkSubmit = async () => {
    if (!bulkSelection.morning && !bulkSelection.evening) {
      showToast("Select at least one morning or evening item");
      return;
    }

    const validDates = bulkSelectedDates.filter((date) => {
      const day = new Date(date).getDay();
      const isWeekend = day === 0 || day === 6;
      return !isWeekend && !isDateBlocked(date);
    });

    if (validDates.length === 0) {
      showToast("No valid dates selected");
      return;
    }

    try {
      for (const date of validDates) {
        await axios.post(`${API_BASE}/place_order`, {
          employee_id: userId,
          date,
          morning: bulkSelection.morning,
          evening: bulkSelection.evening,
        });
      }

      showToast(`Bulk order placed for ${validDates.length} days`);
      setBulkMode(false);
      setBulkSelectedDates([]);
      setBulkSelection({ morning: null, evening: null });
      fetchMyOrders();
    } catch (error) {
      console.error("Error submitting bulk order:", error);
      showToast(error.response?.data?.error || "Failed to submit bulk order");
    }
  };

  const handleDeleteOrder = async () => {
    if (!selectedDate) return;
    if (!window.confirm("Cancel the entire order for this day?")) return;

    try {
      await axios.delete(`${API_BASE}/cancel_order`, {
        data: { employee_id: userId, date: selectedDate },
      });

      setOrders((previous) => {
        const nextOrders = { ...previous };
        delete nextOrders[selectedDate];
        return nextOrders;
      });

      showToast("Order cancelled successfully");
      setSelectedDate(null);
      setTempSelection({ morning: null, evening: null });
    } catch (error) {
      console.error("Error cancelling order:", error);
      showToast(error.response?.data?.error || "Failed to cancel order");
    }
  };

  const handleCancel = () => {
    setSelectedDate(null);
    setTempSelection({ morning: null, evening: null });
  };

  const employeeSummary = useMemo(() => {
    return dates.reduce(
      (accumulator, date) => {
        const order = orders[date];
        if (!order) return accumulator;
        accumulator.totalDays += 1;
        if (order.morning) accumulator.morningSelections += 1;
        if (order.evening) accumulator.eveningSelections += 1;
        return accumulator;
      },
      { totalDays: 0, morningSelections: 0, eveningSelections: 0 }
    );
  }, [dates, orders]);

  const filteredEmployeeHistoryOrders = useMemo(() => {
    return historyOrders.filter((order) => {
      if (employeeHistoryFilters.dateFrom && order.date < employeeHistoryFilters.dateFrom) return false;
      if (employeeHistoryFilters.dateTo && order.date > employeeHistoryFilters.dateTo) return false;

      if (employeeHistoryFilters.beverageType !== "all") {
        const matchesBeverage =
          order.morning === employeeHistoryFilters.beverageType ||
          order.evening === employeeHistoryFilters.beverageType;
        if (!matchesBeverage) return false;
      }

      return true;
    });
  }, [employeeHistoryFilters, historyOrders]);

  useEffect(() => {
    setEmployeeHistoryPage(1);
  }, [employeeHistoryFilters]);

  const employeeHistoryPageCount = Math.max(
    1,
    Math.ceil(filteredEmployeeHistoryOrders.length / EMPLOYEE_HISTORY_PAGE_SIZE)
  );

  const visibleEmployeeHistoryOrders = filteredEmployeeHistoryOrders.slice(
    (employeeHistoryPage - 1) * EMPLOYEE_HISTORY_PAGE_SIZE,
    employeeHistoryPage * EMPLOYEE_HISTORY_PAGE_SIZE
  );

  const filteredAdminHistoryOrders = useMemo(() => {
    const search = (adminHistoryFilters.search || "").trim().toLowerCase();

    return adminHistoryOrders.filter((order) => {
      if (adminHistoryFilters.dateFrom && order.date < adminHistoryFilters.dateFrom) return false;
      if (adminHistoryFilters.dateTo && order.date > adminHistoryFilters.dateTo) return false;

      if (
        adminHistoryFilters.department !== "all" &&
        order.employee_department !== adminHistoryFilters.department
      ) {
        return false;
      }

      if (adminHistoryFilters.beverageType !== "all") {
        const matchesBeverage =
          order.morning === adminHistoryFilters.beverageType ||
          order.evening === adminHistoryFilters.beverageType;
        if (!matchesBeverage) return false;
      }

      if (!search) return true;

      return [
        order.employee_name,
        order.employee_email,
        order.employee_department,
        order.employee_designation,
        order.date,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [adminHistoryFilters, adminHistoryOrders]);

  const exportEmployeeHistory = () => {
    downloadCsv(
      `my_tea_coffee_history_${toISODate(new Date())}.csv`,
      ["Date", "Morning", "Evening"],
      filteredEmployeeHistoryOrders.map((order) => [order.date || "", order.morning || "", order.evening || ""])
    );
  };

  const exportAdminHistory = () => {
    downloadCsv(
      `tea_coffee_admin_history_${toISODate(new Date())}.csv`,
      ["Date", "Employee Name", "Employee Email", "Department", "Designation", "Morning", "Evening"],
      filteredAdminHistoryOrders.map((order) => [
        order.date || "",
        order.employee_name || "",
        order.employee_email || "",
        order.employee_department || "",
        order.employee_designation || "",
        order.morning || "",
        order.evening || "",
      ])
    );
  };

  if (loading) {
    return (
      <section className="tea-workspace">
        <div className="fiori-loading-card">
          <Coffee size={28} />
          <div>
            <strong>Loading tea and coffee workspace</strong>
            <p>Preparing beverage orders and availability windows.</p>
          </div>
        </div>
      </section>
    );
  }

  if (isAdmin) {
    return (
      <>
        <AdminView
          dates={dates}
          orders={orders}
          historyOrders={adminHistoryOrders}
          blockedDates={blockedDates}
          onBlockDate={handleBlockDate}
          onUnblockDate={handleUnblockDate}
          onRefresh={refreshOrders}
          filters={adminFilters}
          onFilterChange={handleAdminFilterChange}
          historyFilters={adminHistoryFilters}
          onHistoryFilterChange={handleAdminHistoryFilterChange}
          onExportHistory={exportAdminHistory}
          onGuestOrder={handleGuestOrder}
        />
        {message ? (
          <div className="admin-toast is-success">{message}</div>
        ) : null}
      </>
    );
  }

  return (
    <section className="tea-workspace">
      <header className="admin-hero">
        <div>
          <div className="admin-section-overline">Hospitality Requests</div>
          <h1>Tea and Coffee</h1>
        </div>

        <div className="admin-hero-meta">
          <div className="admin-hero-meta-item">
            <span>Morning cutoff</span>
            <strong>{MORNING_CUTOFF}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Evening cutoff</span>
            <strong>{EVENING_CUTOFF}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Blocked dates</span>
            <strong>{blockedDates.length}</strong>
          </div>
        </div>
      </header>

      <section className="tea-summary-grid">
        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Ordered Days</span>
            <ListChecks size={18} />
          </div>
          <div className="fiori-stat-value">{employeeSummary.totalDays}</div>
          <div className="fiori-stat-note">Days where you have at least one active beverage order</div>
        </article>

        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Morning Selections</span>
            <CupSoda size={18} />
          </div>
          <div className="fiori-stat-value">{employeeSummary.morningSelections}</div>
          <div className="fiori-stat-note">Morning beverage selections currently recorded</div>
        </article>

        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Evening Selections</span>
            <Coffee size={18} />
          </div>
          <div className="fiori-stat-value">{employeeSummary.eveningSelections}</div>
          <div className="fiori-stat-note">Evening beverage selections currently recorded</div>
        </article>
      </section>

      <section className="fiori-panel">
        <div className="fiori-panel-header">
          <div>
            <h3>Ordering Controls</h3>
            <p>Switch bulk mode on or off, then select dates from the calendar below</p>
          </div>
          <div className="tea-toolbar">
            <button className="fiori-button secondary" onClick={refreshOrders}>
              <RefreshCw size={16} />
              <span>Refresh orders</span>
            </button>
            <button
              className={`fiori-button ${bulkMode ? "danger" : "primary"}`}
              onClick={() => {
                setBulkMode(!bulkMode);
                setBulkSelectedDates([]);
                setBulkSelection({ morning: null, evening: null });
              }}
            >
              {bulkMode ? (
                <>
                  <X size={16} />
                  <span>Cancel bulk mode</span>
                </>
              ) : (
                <>
                  <CalendarDays size={16} />
                  <span>Bulk order mode</span>
                </>
              )}
            </button>
          </div>
        </div>

        {bulkMode ? (
          <div className="tea-bulk-panel">
            <div className="tea-bulk-grid">
              <SlotSelector
                label="Morning"
                cutoff={`By ${MORNING_CUTOFF}`}
                value={bulkSelection.morning}
                locked={false}
                onToggle={(option) =>
                  setBulkSelection((previous) => ({
                    ...previous,
                    morning: previous.morning === option ? null : option,
                  }))
                }
              />

              <SlotSelector
                label="Evening"
                cutoff={`By ${EVENING_CUTOFF}`}
                value={bulkSelection.evening}
                locked={false}
                onToggle={(option) =>
                  setBulkSelection((previous) => ({
                    ...previous,
                    evening: previous.evening === option ? null : option,
                  }))
                }
              />
            </div>

            <div className="tea-bulk-footer">
              <span>{bulkSelectedDates.length} dates selected</span>
              <button
                className="fiori-button primary"
                onClick={handleBulkSubmit}
                disabled={bulkSelectedDates.length === 0}
              >
                Submit bulk order
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="fiori-panel">
        <div className="fiori-panel-header">
          <div>
            <h3>Ordering Calendar</h3>
            <p>Select a service date to add, update, or cancel your beverage order</p>
          </div>
        </div>

        <div className="tea-employee-grid">
          {dates.map((date) => {
            const label = formatDateLabel(date);
            const order = orders[date];
            const day = new Date(date).getDay();
            const isWeekend = day === 0 || day === 6;
            const blocked = isDateBlocked(date);
            const isSelected = selectedDate === date;
            const isBulkSelected = bulkSelectedDates.includes(date);
            const morningPastCutoff = isPastCutoff(date, "morning");
            const eveningPastCutoff = isPastCutoff(date, "evening");

            return (
              <button
                key={date}
                type="button"
                className={`tea-day-card ${isSelected ? "is-selected" : ""} ${
                  isBulkSelected ? "is-bulk-selected" : ""
                } ${blocked ? "is-blocked" : ""} ${isWeekend ? "is-weekend" : ""}`}
                onClick={() => handleDateClick(date)}
                disabled={isWeekend || blocked}
              >
                <div className="tea-day-top">
                  <strong>{label.day}, {label.date}</strong>
                  <span>{label.month}</span>
                </div>

                {blocked ? (
                  <div className="tea-day-state is-danger">Unavailable</div>
                ) : isWeekend ? (
                  <div className="tea-day-state">Weekend</div>
                ) : order ? (
                  <div className="tea-day-orders">
                    {order.morning ? <BeveragePill beverage={order.morning} locked={morningPastCutoff} /> : null}
                    {order.evening ? <BeveragePill beverage={order.evening} locked={eveningPastCutoff} /> : null}
                  </div>
                ) : (
                  <div className="tea-day-state">{isBulkSelected ? "Selected for bulk" : "No order"}</div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="fiori-panel">
        <div className="fiori-panel-header">
          <div>
            <h3>My Past Orders</h3>
            <p>{filteredEmployeeHistoryOrders.length} historical beverage orders found.</p>
          </div>
          <button className="fiori-button secondary" onClick={exportEmployeeHistory} disabled={!historyOrders.length}>
            <Download size={16} />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="employee-directory-filters employee-directory-filters-extended">
          <label className="employee-filter-field">
            <span>Beverage Type</span>
            <ValueHelpSelect
              value={employeeHistoryFilters.beverageType}
              onChange={(value) => handleEmployeeHistoryFilterChange("beverageType", value)}
              searchPlaceholder="Search beverages"
              options={[
                { value: "all", label: "All beverages" },
                { value: "tea", label: "Tea" },
                { value: "coffee", label: "Coffee" },
                { value: "milk", label: "Milk" },
              ]}
            />
          </label>

          <label className="employee-filter-field">
            <span>History From</span>
            <input
              className="input"
              type="date"
              value={employeeHistoryFilters.dateFrom}
              onChange={(event) => handleEmployeeHistoryFilterChange("dateFrom", event.target.value)}
            />
          </label>

          <label className="employee-filter-field">
            <span>History To</span>
            <input
              className="input"
              type="date"
              value={employeeHistoryFilters.dateTo}
              onChange={(event) => handleEmployeeHistoryFilterChange("dateTo", event.target.value)}
            />
          </label>
        </div>

        {filteredEmployeeHistoryOrders.length === 0 ? (
          <div className="admin-empty-state">
            <ListChecks size={24} />
            <div>
              <strong>No past beverage orders found</strong>
              <p>Adjust beverage type or date range to review your order history.</p>
            </div>
          </div>
        ) : (
          <div className="fiori-table-shell tea-history-shell">
            <table className="fiori-table tea-history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Morning</th>
                  <th>Evening</th>
                </tr>
              </thead>
              <tbody>
                {visibleEmployeeHistoryOrders.map((order) => (
                  <tr key={`${order.date}-${order._id || "history"}`}>
                    <td>{formatDateLabel(order.date).full}</td>
                    <td>{order.morning ? <BeveragePill beverage={order.morning} /> : "—"}</td>
                    <td>{order.evening ? <BeveragePill beverage={order.evening} /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredEmployeeHistoryOrders.length > EMPLOYEE_HISTORY_PAGE_SIZE ? (
          <div className="tea-history-pagination">
            <span>
              Showing {(employeeHistoryPage - 1) * EMPLOYEE_HISTORY_PAGE_SIZE + 1}-
              {Math.min(employeeHistoryPage * EMPLOYEE_HISTORY_PAGE_SIZE, filteredEmployeeHistoryOrders.length)} of{" "}
              {filteredEmployeeHistoryOrders.length}
            </span>
            <div>
              <button
                type="button"
                className="fiori-button secondary"
                onClick={() => setEmployeeHistoryPage((page) => Math.max(1, page - 1))}
                disabled={employeeHistoryPage === 1}
              >
                Previous
              </button>
              <button
                type="button"
                className="fiori-button secondary"
                onClick={() => setEmployeeHistoryPage((page) => Math.min(employeeHistoryPageCount, page + 1))}
                disabled={employeeHistoryPage === employeeHistoryPageCount}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {selectedDate ? (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <div>
                <h2>Order Beverage</h2>
                <p>{formatDateLabel(selectedDate).full}</p>
              </div>
            </div>

            <div className="tea-modal-content">
              <SlotSelector
                label="Morning"
                cutoff={`By ${MORNING_CUTOFF}`}
                value={tempSelection.morning}
                locked={isPastCutoff(selectedDate, "morning")}
                onToggle={(option) => handleSlotToggle("morning", option)}
              />

              <SlotSelector
                label="Evening"
                cutoff={`By ${EVENING_CUTOFF}`}
                value={tempSelection.evening}
                locked={isPastCutoff(selectedDate, "evening")}
                onToggle={(option) => handleSlotToggle("evening", option)}
              />
            </div>

            <div className="admin-modal-actions">
              <button className="fiori-button secondary" onClick={handleCancel}>
                Cancel
              </button>
              {orders[selectedDate] ? (
                <button className="fiori-button secondary danger" onClick={handleDeleteOrder}>
                  Cancel order
                </button>
              ) : null}
              <button className="fiori-button primary" onClick={handleSubmit}>
                Submit order
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {message ? (
        <div className="admin-toast is-success">{message}</div>
      ) : null}
    </section>
  );
};

export default TeaCoffee;
