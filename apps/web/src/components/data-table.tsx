import type { ReactNode } from "react";

// Table with a header row. Shows a message when there are no rows.
export function DataTable({
  columns,
  rows,
  emptyMessage = "Nothing here yet.",
}: {
  columns: readonly string[];
  rows: readonly (readonly ReactNode[])[];
  emptyMessage?: string;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={columns.length}>{emptyMessage}</td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
