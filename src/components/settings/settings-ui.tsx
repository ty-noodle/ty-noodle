import type { ReactNode } from "react";
import {
  CircleCheck,
  Home,
  Image as ImageIcon,
  Info,
  Lightbulb,
  Package,
  Rows3,
  Store,
  Truck,
  WalletCards,
} from "lucide-react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export const settingsFieldLabelClass = "mb-2 block text-sm font-medium text-slate-700";

export const settingsInputClass =
  "w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[#003366] placeholder:text-slate-400";

export const settingsSelectClass = cx(settingsInputClass, "appearance-none");

export const settingsReadOnlyClass = cx(settingsInputClass, "bg-slate-100 text-slate-600");

export function SettingsPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SettingsPanelHeader({
  title,
  description,
  icon,
}: {
  description?: string;
  icon?: string;
  title: string;
}) {
  const Icon =
    icon === "info"
      ? Info
      : icon === "payments"
        ? WalletCards
        : icon === "inventory"
          ? Package
          : icon === "house"
            ? Store
            : icon === "list"
              ? Rows3
                : icon === "image"
                  ? ImageIcon
                  : icon === "truck"
                    ? Truck
                  : icon === "lightbulb"
                    ? Lightbulb
                    : null;

  return (
    <div className="border-b border-slate-100 px-6 py-4">
      <div className="flex items-start gap-3">
        {Icon ? <Icon className="mt-0.5 h-5 w-5 text-[#003366]" strokeWidth={2.2} /> : null}
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-slate-950">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SettingsPanelBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const hasPaddingOverride = !!className?.match(/\bp-\d|\bpx-\d|\bpy-\d/);
  return <div className={cx(!hasPaddingOverride && "p-6", className)}>{children}</div>;
}

export function SettingsMetricCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
      <p className="text-sm font-normal text-slate-500">{label}</p>
      <p className="mt-3 text-[2rem] font-semibold tracking-[-0.02em] text-slate-950">{value}</p>
    </article>
  );
}

export function SettingsInfoCallout({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-accent-200 bg-accent-50/70 p-4">
      <p className="text-sm font-semibold text-accent-700">{title}</p>
      <div className="mt-1 text-sm leading-6 text-slate-600">{children}</div>
    </div>
  );
}

export function SettingsEmptyState({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettingsPill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "accent" | "default";
}) {
  return (
    <span
      className={cx(
        "inline-flex rounded-full px-3 py-1 text-xs font-medium",
        tone === "accent"
          ? "bg-accent-50 text-accent-700"
          : "bg-slate-100 text-slate-600",
      )}
    >
      {children}
    </span>
  );
}

export const SettingsIcons = {
  Check: CircleCheck,
  Home,
  Image: ImageIcon,
  Info,
  Inventory: Package,
  Lightbulb,
  Truck,
};
