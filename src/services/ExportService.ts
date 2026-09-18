// ExportService - Structured CSV and Data Export Engine
// Ensures UTF-8 BOM for Arabic Excel compatibility and strictly formatted standard numbers.

export class ExportService {
  /**
   * Converts array of objects into a properly formatted CSV with UTF-8 BOM
   */
  static generateCsv(
    columns: Array<{ key: string; label: string }>,
    rows: Array<Record<string, any>>
  ): string {
    const headerRow = columns.map((col) => `"${col.label.replace(/"/g, '""')}"`).join(',');

    const dataRows = rows.map((row) =>
      columns
        .map((col) => {
          let val = row[col.key];
          if (val === undefined || val === null) {
            val = '';
          } else if (typeof val === 'number') {
            val = String(val);
          } else {
            val = `"${String(val).replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(',')
    );

    // Prepend UTF-8 BOM (\uFEFF) for Arabic Excel compatibility
    return '\uFEFF' + [headerRow, ...dataRows].join('\r\n');
  }

  /**
   * Triggers CSV download in browser environment
   */
  static downloadCsv(csvContent: string, fileName: string) {
    if (typeof window === 'undefined') return;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
