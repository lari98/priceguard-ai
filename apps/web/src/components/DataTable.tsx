import type { ReactNode } from 'react';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  key: string;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyLabel,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p style={{ color: 'var(--gg-muted)' }}>{emptyLabel}</p>;
  }

  return (
    <div className="gg-panel overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--gg-border)' }}>
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 text-left font-medium" style={{ color: 'var(--gg-muted)' }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} style={{ borderBottom: '1px solid var(--gg-border)' }}>
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3">
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
