"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

type LineUserIdCopyProps = {
  value: string;
};

function truncateLineUserId(value: string) {
  if (value.length <= 10) {
    return value;
  }

  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

export function LineUserIdCopy({ value }: LineUserIdCopyProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeoutId = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span className="font-mono text-xs text-slate-400">{truncateLineUserId(value)}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
        aria-label="คัดลอก LINE user ID"
        title="คัดลอก LINE user ID"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.4} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2.2} />}
      </button>
    </div>
  );
}
