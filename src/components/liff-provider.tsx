"use client";

import { useRef, createContext, useContext, useEffect, useState } from "react";

// @line/liff is loaded dynamically on mount — keeps it out of the initial JS bundle
type LiffType = Awaited<typeof import("@line/liff")>["default"];

type LiffProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
};

type LiffContextType = {
  isReady: boolean;
  error: Error | null;
  profile: LiffProfile | null;
  liffToken: string | null;
  login: () => void;
  logout: () => void;
};

const LiffContext = createContext<LiffContextType>({
  isReady: false,
  error: null,
  profile: null,
  liffToken: null,
  login: () => {},
  logout: () => {},
});

export const useLiff = () => useContext(LiffContext);

export function LiffProvider({
  children,
  liffId,
}: {
  children: React.ReactNode;
  liffId: string;
}) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [liffToken, setLiffToken] = useState<string | null>(null);

  // Holds the liff instance after dynamic import resolves
  const liffRef = useRef<LiffType | null>(null);

  useEffect(() => {
    if (!liffId) {
      console.error("LIFF ID is required");
      return;
    }

    const initLiff = async () => {
      try {
        const useMock = process.env.NEXT_PUBLIC_LIFF_MOCK === "true";

        // Dynamically import LIFF so it is excluded from the initial bundle
        const liffModule = await import("@line/liff");
        const liff = liffModule.default;
        liffRef.current = liff;

        if (useMock) {
          const { LiffMockPlugin } = await import("@line/liff-mock");
          liff.use(new LiffMockPlugin());
        }

        await liff.init({
          liffId,
          // @ts-expect-error - mock property exists only when using LiffMockPlugin
          mock: useMock,
        });

        if (useMock) {
          // @ts-expect-error - $mock property exists only when using LiffMockPlugin
          liff.$mock.set((p) => ({
            ...p,
            getProfile: {
              userId: "U-MOCK-USER-123",
              displayName: "Mock User (Tester)",
              // No pictureUrl — fallback person icon shows in dev
            },
          }));
        }

        if (liff.isLoggedIn()) {
          const userProfile = await liff.getProfile();
          console.log("[LIFF] profile pictureUrl:", userProfile.pictureUrl);
          setProfile(userProfile);
          setLiffToken(liff.getIDToken());
        }

        setIsReady(true);
      } catch (err) {
        console.error("LIFF init error", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsReady(true); // Still ready, just failed
      }
    };

    initLiff();
  }, [liffId]);

  const login = async () => {
    const liff = liffRef.current;
    if (!liff || liff.isLoggedIn()) return;

    liff.login();

    // In mock mode there is no page redirect — update state manually
    if (process.env.NEXT_PUBLIC_LIFF_MOCK === "true") {
      try {
        const userProfile = await liff.getProfile();
        setProfile(userProfile);
        setLiffToken(liff.getIDToken());
      } catch (err) {
        console.error("Mock login profile fetch error", err);
      }
    }
  };

  const logout = () => {
    const liff = liffRef.current;
    if (!liff || !liff.isLoggedIn()) return;
    liff.logout();
    setProfile(null);
    setLiffToken(null);
  };

  return (
    <LiffContext.Provider value={{ isReady, error, profile, liffToken, login, logout }}>
      {children}
    </LiffContext.Provider>
  );
}
