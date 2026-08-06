/**
 * Utility to export JavaScript objects to a CSV file.
 * Handles UTF-8 BOM, special characters, double quotes, and line breaks properly.
 */
export const exportToCSV = (filename, headers, data) => {
  if (!data || !data.length) {
    alert("No records available to export.");
    return;
  }

  const formatCell = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/\r?\n|\r/g, " ");
    return `"${str.replace(/"/g, '""')}"`;
  };

  const headerRow = headers.map((h) => formatCell(h.label)).join(",");
  const dataRows = data.map((row) =>
    headers
      .map((h) => {
        const val = typeof h.key === "function" ? h.key(row) : row[h.key];
        return formatCell(val);
      })
      .join(",")
  );

  const csvContent = "\uFEFF" + [headerRow, ...dataRows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
