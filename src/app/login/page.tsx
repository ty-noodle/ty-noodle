import Image from "next/image";
import { Suspense } from "react";
import { OtpPinForm } from "@/components/auth/otp-pin-form";
import { verifyPin } from "./actions";
import {
  hasPinPepper,
  hasSessionSecret,
  hasSupabaseEnv,
} from "@/lib/supabase/env";

const ERROR_MESSAGES: Record<string, string> = {
  "incorrect-pin": "รหัสผิด กรุณาลองใหม่อีกครั้ง",
  "invalid-pin": "รหัสไม่ถูกต้อง กรุณาลองใหม่",
  "pin-locked": "บัญชีถูกล็อก กรุณาลองใหม่ภายหลัง",
  "login-unavailable": "ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่",
  "session-unavailable": "เกิดข้อผิดพลาด กรุณาลองใหม่",
  "missing-supabase-config": "ระบบยังไม่ได้ตั้งค่า",
  "missing-session-secret": "ระบบยังไม่ได้ตั้งค่า",
  "missing-pin-pepper": "ระบบยังไม่ได้ตั้งค่า",
};

function resolveLoginError(error: string): string {
  return ERROR_MESSAGES[decodeURIComponent(error)] ?? decodeURIComponent(error);
}

type LoginSearchParams = {
  error?: string;
  next?: string;
  sent?: string;
};

type LoginPageProps = {
  searchParams: Promise<LoginSearchParams>;
};

export const metadata = {
  title: "Login",
};

function LoginShell({
  configured,
  error,
  next,
  action,
}: {
  configured: boolean;
  error?: string;
  next?: string;
  action?: (formData: FormData) => void;
}) {
  return (
    <main className="flex h-[100dvh] w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(0,0,255,0.08),transparent_32%),linear-gradient(180deg,#f7f9ff_0%,#ffffff_100%)] px-4 overflow-hidden touch-none select-none">
      <section className="w-full max-w-[22.5rem] rounded-[2rem] bg-white px-5 pb-7 pt-9 shadow-[0_20px_50px_rgba(69,95,176,0.12)] border border-slate-100/50">
        <div className="relative mx-auto w-full">
          <div className="mb-6 flex justify-center">
            <Image
              src="/ty-noodles-logo-cropped.png"
              alt="T&Y Noodles logo"
              width={200}
              height={120}
              priority
              className="h-auto w-[10rem] drop-shadow-[0_8px_16px_rgba(0,0,255,0.06)]"
            />
          </div>
          <OtpPinForm
            disabled={!configured || !action}
            error={error}
            errorMessages={ERROR_MESSAGES}
            next={next}
            action={action}
          />
          {!configured ? (
            <p className="mt-4 text-center text-xs text-rose-600">
              ต้องตั้งค่า Env ก่อนใช้งาน
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

async function LoginPageContent({
  searchParams,
}: LoginPageProps) {
  const params = await searchParams;
  const configured =
    hasSupabaseEnv() && hasSessionSecret() && hasPinPepper();

  return (
    <LoginShell
      configured={configured}
      error={params.error ? resolveLoginError(params.error) : undefined}
      next={params.next}
      action={verifyPin}
    />
  );
}

export default function LoginPage(props: LoginPageProps) {
  return (
    <Suspense fallback={<LoginShell configured={false} />}>
      <LoginPageContent {...props} />
    </Suspense>
  );
}
