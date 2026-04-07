import Image from "next/image";
import { OtpPinForm } from "@/components/auth/otp-pin-form";
import {
  hasPinPepper,
  hasSessionSecret,
  hasSupabaseEnv,
} from "@/lib/supabase/env";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    sent?: string;
  }>;
};

export const metadata = {
  title: "Login",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const configured =
    hasSupabaseEnv() && hasSessionSecret() && hasPinPepper();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(0,0,255,0.08),transparent_32%),linear-gradient(180deg,#f7f9ff_0%,#ffffff_100%)] px-4 py-6 sm:px-6 sm:py-10">
      <section className="w-full max-w-[23rem] rounded-[2.25rem] bg-[#FFFFFF] px-5 pb-8 pt-10 shadow-[0_20px_50px_rgba(69,95,176,0.14)] sm:max-w-[24.5rem] sm:px-6">
          <div className="relative mx-auto w-full max-w-sm">
            <div className="mb-8 flex justify-center">
              <Image
                src="/ty-noodles-logo-cropped.png"
                alt="T&Y Noodles logo"
                width={220}
                height={134}
                priority
                className="h-auto w-[11rem] drop-shadow-[0_12px_24px_rgba(0,0,255,0.08)] sm:w-[12.5rem]"
              />
            </div>
            <OtpPinForm
              disabled={!configured}
              error={params.error ? decodeURIComponent(params.error) : undefined}
            />
            {!configured ? (
              <p className="mt-6 text-center text-sm text-rose-600">
                ต้องตั้งค่า `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
                `LOGIN_PIN_PEPPER` และ `SESSION_SECRET`
              </p>
            ) : null}
          </div>
      </section>
    </main>
  );
}
