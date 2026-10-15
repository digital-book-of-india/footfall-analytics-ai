import React from 'react';

export function StatusBadge({ status }: { status: string }) {
  let style = 'bg-slate-800 text-slate-300 border-slate-700';
  if (status === 'ONLINE' || status === 'ACTIVE' || status === 'SUCCESS') {
    style = 'bg-emerald-950/80 text-emerald-400 border-emerald-800';
  } else if (status === 'OFFLINE' || status === 'SUSPENDED' || status === 'FAILED') {
    style = 'bg-red-950/80 text-red-400 border-red-800';
  } else if (status === 'DEGRADED' || status === 'NEEDS_SETUP' || status === 'PENDING') {
    style = 'bg-amber-950/80 text-amber-400 border-amber-800';
  }

  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${style}`}>
      {status}
    </span>
  );
}
