"use client";

import { useRouter } from "next/navigation";
import type { FormHTMLAttributes, ReactNode } from "react";
import { useTransition } from "react";

type ReportGetFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "children"> & {
  action: string;
  children: ReactNode;
  scroll?: boolean;
};

export function ReportGetForm({
  action,
  children,
  onSubmit,
  scroll = false,
  ...props
}: ReportGetFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <form
      {...props}
      action={action}
      method="GET"
      data-pending={isPending ? "true" : "false"}
      aria-busy={isPending}
      onSubmit={(event) => {
        onSubmit?.(event);
        if (event.defaultPrevented) {
          return;
        }

        event.preventDefault();

        const formData = new FormData(event.currentTarget);
        const params = new URLSearchParams();

        for (const [key, value] of formData.entries()) {
          const normalizedValue = String(value).trim();
          if (!normalizedValue) {
            continue;
          }
          params.append(key, normalizedValue);
        }

        const nextUrl = params.size > 0 ? `${action}?${params.toString()}` : action;
        startTransition(() => {
          router.push(nextUrl, { scroll });
        });
      }}
    >
      {children}
    </form>
  );
}
