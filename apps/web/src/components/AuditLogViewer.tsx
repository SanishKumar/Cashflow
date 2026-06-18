/**
 * Audit Log Viewer Component
 *
 * Displays the paginated activity feed for a specific group.
 */

import { useState, useEffect } from "react";
import { auditLogApi } from "../lib/api";
import type { AuditLogEntry } from "../types/index";

interface AuditLogViewerProps {
  groupId: string;
}

export function AuditLogViewer({ groupId }: AuditLogViewerProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    let isMounted = true;
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const res = await auditLogApi.listByGroup(groupId, { page, limit: 10 });
        if (isMounted) {
          setLogs(res.items);
          setTotalPages(res.totalPages);
        }
      } catch (err) {
        console.error("Failed to load audit logs", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchLogs();
    return () => { isMounted = false; };
  }, [groupId, page]);

  if (loading && logs.length === 0) {
    return <div className="p-4 text-[13px] text-on-surface-variant animate-pulse">Loading activity...</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {logs.length === 0 ? (
        <div className="p-4 text-[13px] text-on-surface-variant text-center border border-outline-variant/30 rounded-lg bg-surface-container">
          No activity recorded yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2 relative">
          {/* Vertical timeline line */}
          <div className="absolute left-[15px] top-4 bottom-4 w-px bg-outline-variant/50" />
          
          {logs.map((log) => (
            <div key={log.id} className="flex gap-3 relative">
              <div className="w-8 h-8 rounded-full bg-surface-variant border-2 border-background flex items-center justify-center shrink-0 z-10 text-[14px]">
                {log.action.includes("EXPENSE") ? "💸" : 
                 log.action.includes("SETTLEMENT") ? "🤝" : 
                 log.action.includes("ROLE") ? "🛡️" : "📝"}
              </div>
              <div className="flex-1 bg-surface-container border border-outline-variant/30 p-3 rounded-lg flex flex-col min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[13px] text-on-surface leading-tight">
                    <span className="font-semibold">{log.user?.name || "Someone"}</span> {log.details}
                  </span>
                  <span className="text-[10px] text-on-surface-variant whitespace-nowrap shrink-0">
                    {new Date(log.createdAt).toLocaleString(undefined, { 
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button 
            onClick={() => setPage(p => Math.max(1, p - 1))} 
            disabled={page === 1 || loading}
            className="btn-ghost !px-2 !py-1 !h-auto text-[12px]"
          >
            Previous
          </button>
          <span className="text-[11px] text-on-surface-variant">
            Page {page} of {totalPages}
          </span>
          <button 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
            disabled={page === totalPages || loading}
            className="btn-ghost !px-2 !py-1 !h-auto text-[12px]"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
