"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type OtpPinFormProps = {
  disabled: boolean;
  errorMessages?: Record<string, string>;
  error?: string;
  next?: string;
  action?: (formData: FormData) => void;
};

const keypad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "delete"] as const;
const instrumentSansClass = "font-[family-name:var(--font-instrument-sans)]";

type PinLoginResponse =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

export function OtpPinForm({ disabled, errorMessages, error, next, action }: OtpPinFormProps) {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  function appendDigit(value: string) {
    if (disabled || isSubmitting) return;

    setLocalError(null);
    setDigits((current) => {
      if (current.length >= 6) return current;
      return [...current, value];
    });
  }

  function removeDigit() {
    if (disabled || isSubmitting) return;
    setLocalError(null);
    setDigits((current) => current.slice(0, -1));
  }

  const token = useMemo(() => digits.join(""), [digits]);
  const canSubmit = !disabled && !isSubmitting && token.length === 6;

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isSubmitting) return;

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      appendDigit(event.key);
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      removeDigit();
      return;
    }

    if (event.key === "Enter" && token.length === 6 && formRef.current) {
      event.preventDefault();
      formRef.current.requestSubmit();
    }
  });

  useEffect(() => {
    if (token.length === 6 && formRef.current && !disabled && !isSubmitting) {
      formRef.current.requestSubmit();
    }
  }, [disabled, isSubmitting, token]);

  useEffect(() => {
    if (disabled) return;

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (disabled || isSubmitting || token.length !== 6) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    setIsSubmitting(true);
    setLocalError(null);

    try {
      const response = await fetch("/api/auth/pin-login", {
        method: "POST",
        body: new FormData(event.currentTarget),
        cache: "no-store",
      });
      const payload = (await response.json()) as PinLoginResponse;

      if (payload.ok) {
        setDigits([]);
        setLocalError(null);
        setIsSubmitting(false);
        router.replace(payload.redirectTo);
        return;
      }

      setDigits([]);
      setLocalError(errorMessages?.[payload.error] ?? payload.error);
      setIsSubmitting(false);
    } catch {
      setDigits([]);
      setLocalError(errorMessages?.["login-unavailable"] ?? "login-unavailable");
      setIsSubmitting(false);
    }
  }

  const visibleError = localError ?? error;

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={handleSubmit}
      className="w-full"
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="next" value={next ?? ""} />

      <div className="flex items-center justify-center gap-3">
        {Array.from({ length: 6 }).map((_, index) => {
          const filled = index < digits.length;
          return (
            <div
              key={index}
              className={`h-4 w-4 rounded-full border transition ${
                filled
                  ? "border-accent-600 bg-accent-600 shadow-[0_0_0_6px_rgba(0,0,255,0.12)]"
                  : "border-slate-300 bg-white"
              }`}
            />
          );
        })}
      </div>

      <div className="mt-5 h-6 text-center">
        {isSubmitting ? (
          <p className="text-sm font-semibold text-[#003366]">กำลังเข้า...</p>
        ) : visibleError ? (
          <p className="text-sm font-semibold text-rose-600">{visibleError}</p>
        ) : null}
      </div>

      <div className="mx-auto mt-5 grid w-full grid-cols-3 gap-4 sm:gap-5">
        {keypad.map((key, index) => {
          if (key === "") return <div key={`empty-${index}`} />;

          if (key === "delete") {
            return (
              <button
                key={key}
                type="button"
                onClick={removeDigit}
                disabled={disabled || isSubmitting || digits.length === 0}
                aria-disabled={disabled || isSubmitting || digits.length === 0}
                className={`${instrumentSansClass} flex aspect-square items-center justify-center rounded-full bg-white text-base font-bold text-accent-700 shadow-[0_14px_30px_rgba(0,0,255,0.10)] hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-60`}
              >
                ลบ
              </button>
            );
          }

          return (
            <button
              key={key}
              type="button"
              onClick={() => appendDigit(key)}
              disabled={disabled || isSubmitting || digits.length >= 6}
              aria-disabled={disabled || isSubmitting || digits.length >= 6}
              aria-label={`ใส่เลข ${key}`}
              className={`${instrumentSansClass} group flex aspect-square flex-col items-center justify-center rounded-full bg-white text-slate-800 shadow-[0_14px_32px_rgba(0,0,255,0.10)] hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <span className="text-[2.05rem] font-medium leading-none tracking-[-0.01em] text-slate-800 sm:text-[2.2rem]">
                {key}
              </span>
              <span className="mt-1 text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-slate-600 group-hover:text-slate-700">
                {key === "1"
                  ? ""
                  : key === "2"
                    ? "ABC"
                    : key === "3"
                      ? "DEF"
                      : key === "4"
                        ? "GHI"
                        : key === "5"
                          ? "JKL"
                          : key === "6"
                            ? "MNO"
                            : key === "7"
                              ? "PQRS"
                              : key === "8"
                                ? "TUV"
                                : key === "9"
                                  ? "WXYZ"
                                  : ""}
              </span>
            </button>
          );
        })}
      </div>

      <button type="submit" disabled={!canSubmit} className="sr-only">
        ยืนยันและเข้าสู่ระบบ
      </button>

    </form>
  );
}
