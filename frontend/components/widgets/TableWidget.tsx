"use client";
import { useState } from "react";

type ColumnConfig = {
  key: string;
  header: string;
  type: "text" | "date" | "link";
  link_key?: string;
};

type TableWidgetProps = {
  data: any[];
  config: {
    columns: ColumnConfig[];
  };
};

export default function TableWidget({ data = [], config }: TableWidgetProps) {
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const columns = config?.columns || [];
  
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="flex h-36 items-center justify-center rounded-xl border border-border bg-bg2 text-text3 text-xs font-mono">
        No records found
      </div>
    );
  }

  const paginatedRows = data.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(data.length / pageSize);

  const renderCellValue = (row: any, col: ColumnConfig) => {
    const val = row[col.key];

    if (col.type === "link" && col.link_key) {
      const linkVal = row[col.link_key] || "#";
      return (
        <a
          href={linkVal}
          target="_blank"
          rel="noopener noreferrer"
          className="text-teal hover:underline font-medium hover:text-teal2 transition-colors flex items-center gap-1 inline-flex"
        >
          {val || "Link"} ↗
        </a>
      );
    }

    if (col.type === "date" && val) {
      try {
        return new Date(val).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        return String(val);
      }
    }

    return String(val ?? "");
  };

  return (
    <div className="flex flex-col gap-4 border border-border bg-bg2 rounded-xl p-4 overflow-hidden">
      <div className="overflow-x-auto min-w-full">
        <table className="min-w-full divide-y divide-border border-collapse">
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th
                  key={i}
                  scope="col"
                  className="px-4 py-3 text-left text-[11px] font-bold font-mono tracking-wider text-text3 uppercase bg-bg3/50 first:rounded-l-lg last:rounded-r-lg"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 text-text text-sm">
            {paginatedRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-bg3/[0.15] transition-colors">
                {columns.map((col, colIndex) => (
                  <td key={colIndex} className="px-4 py-3 font-medium max-w-sm truncate whitespace-nowrap text-text2">
                    {renderCellValue(row, col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/50 pt-4 mt-2">
          <span className="text-xs text-text3 font-mono">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, data.length)} of{" "}
            {data.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-xs rounded border border-border hover:bg-bg3 disabled:opacity-40 transition-colors text-text2 font-mono"
            >
              Prev
            </button>
            <span className="text-xs font-mono px-2 text-text2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-xs rounded border border-border hover:bg-bg3 disabled:opacity-40 transition-colors text-text2 font-mono"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
