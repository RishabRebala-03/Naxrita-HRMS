import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";

function normalizeOption(option) {
  if (typeof option === "string" || typeof option === "number") {
    return { value: String(option), label: String(option) };
  }

  return {
    value: String(option.value ?? ""),
    label: option.label ?? String(option.value ?? ""),
    description: option.description,
    meta: option.meta,
  };
}

export default function ValueHelpSelect({
  value,
  onChange,
  options = [],
  placeholder = "Select value",
  searchPlaceholder = "Search available options",
  className = "",
  disabled = false,
  style,
  popoverClassName = "",
  tableHeaders = [],
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const searchRef = useRef(null);
  const [popoverStyle, setPopoverStyle] = useState({});

  const normalizedOptions = useMemo(() => options.map(normalizeOption), [options]);
  const selected = String(value ?? "")
    ? normalizedOptions.find((option) => option.value === String(value ?? ""))
    : null;

  const filteredOptions = useMemo(() => {
    const nextQuery = query.trim().toLowerCase();
    if (!nextQuery) return normalizedOptions;

    return normalizedOptions.filter((option) =>
      [
        option.label,
        option.description,
        option.value,
        ...(option.meta ? Object.values(option.meta) : []),
      ]
        .filter(Boolean)
        .some((part) => String(part).toLowerCase().includes(nextQuery))
    );
  }, [normalizedOptions, query]);

  useEffect(() => {
    if (!open) return undefined;

    const updatePopoverPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const viewportWidth = window.innerWidth;
      const targetWidth = tableHeaders.length ? 640 : 360;
      const preferredWidth = Math.max(rect.width, Math.min(targetWidth, viewportWidth - 24));
      const maxWidth = viewportWidth - 24;
      const width = Math.min(preferredWidth, maxWidth);
      const left = Math.max(12, Math.min(rect.left, viewportWidth - width - 12));

      setPopoverStyle({
        position: "fixed",
        top: rect.bottom + 6,
        left,
        width,
        minWidth: width,
        right: "auto",
        zIndex: 4000,
      });
    };

    const handleClickOutside = (event) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target) &&
        popoverRef.current &&
        !popoverRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    updatePopoverPosition();
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    window.setTimeout(() => searchRef.current?.focus(), 0);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [open, tableHeaders.length]);

  const handleSelect = (nextValue) => {
    onChange?.(nextValue);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className={`value-help ${open ? "is-open" : ""} ${className}`.trim()} ref={rootRef} style={style}>
      <button
        type="button"
        ref={triggerRef}
        className="value-help-trigger input"
        onClick={() => !disabled && setOpen((previous) => !previous)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? "value-help-label" : "value-help-placeholder"}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown size={16} />
      </button>

      {open ? (
        createPortal(
          <div className={`value-help-popover ${popoverClassName}`.trim()} ref={popoverRef} style={popoverStyle}>
            <div className="value-help-search">
              <Search size={15} />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                  <X size={14} />
                </button>
              ) : null}
            </div>

            <div className="value-help-list" role="listbox">
              {tableHeaders.length ? (
                <div className="value-help-table-head" aria-hidden="true">
                  {tableHeaders.map((header) => <span key={header}>{header}</span>)}
                </div>
              ) : null}
              {filteredOptions.length ? (
                filteredOptions.map((option) => {
                  const isSelected = option.value !== "" && option.value === String(value ?? "");
                  return (
                    <button
                      type="button"
                      key={option.value}
                      className={`value-help-option ${isSelected ? "is-selected" : ""}`}
                      onClick={() => handleSelect(option.value)}
                      role="option"
                      aria-selected={isSelected}
                    >
                      {option.meta ? (
                        <span className="value-help-option-grid">
                          <strong>{option.meta.code || option.label}</strong>
                          <small>{option.meta.name || option.description || ""}</small>
                          <small>{option.meta.client || "-"}</small>
                          <small>{option.meta.type || "-"}</small>
                        </span>
                      ) : (
                        <span>
                          <strong>{option.label}</strong>
                          {option.description ? <small>{option.description}</small> : null}
                        </span>
                      )}
                      {isSelected ? <Check size={16} /> : null}
                    </button>
                  );
                })
              ) : (
                <div className="value-help-empty">No matching options</div>
              )}
            </div>
          </div>,
          document.body
        )
      ) : null}
    </div>
  );
}
