"use client";

import {
  useRef,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { reportOrderDebugClient, summarizeError } from "@/lib/order-debug";

// @line/liff is loaded dynamically on mount — keeps it out of the initial JS bundle
type LiffType = Awaited<typeof import("@line/liff")>["default"];

type LiffProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
};

type LiffSendMessagesParams = Parameters<LiffType["sendMessages"]>[0];

type LiffContextType = {
  isReady: boolean;
  isInClient: boolean;
  error: Error | null;
  profile: LiffProfile | null;
  liffToken: string | null;
  login: () => void;
  logout: () => void;
  closeWindow: () => void;
  refreshProfile: () => Promise<void>;
  sendMessages: (messages: LiffSendMessagesParams) => Promise<void>;
};

const LiffContext = createContext<LiffContextType>({
  isReady: false,
  isInClient: false,
  error: null,
  profile: null,
  liffToken: null,
  login: () => {},
  logout: () => {},
  closeWindow: () => {},
  refreshProfile: async () => {},
  sendMessages: async () => {},
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
  const [isInClient, setIsInClient] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [liffToken, setLiffToken] = useState<string | null>(null);

  // Holds the liff instance after dynamic import resolves
  const liffRef = useRef<LiffType | null>(null);

  const refreshProfile = useCallback(async () => {
    const liff = liffRef.current;
    const useMock = process.env.NEXT_PUBLIC_LIFF_MOCK === "true";
    if (!liff || (!useMock && !liff.isLoggedIn())) return;

    try {
      let userProfile = await liff.getProfile();

      if (!userProfile.pictureUrl) {
        await new Promise((resolve) => window.setTimeout(resolve, 150));
        userProfile = await liff.getProfile();
      }

      console.log("[LIFF] profile pictureUrl:", userProfile.pictureUrl);
      setProfile(userProfile);
      setLiffToken(liff.getIDToken());
    } catch (err) {
      console.error("LIFF profile fetch error", err);
      void reportOrderDebugClient("liff_profile_fetch_error", {
        error: summarizeError(err),
      });
    }
  }, []);

  useEffect(() => {
    if (!liffId) {
      console.error("LIFF ID is required");
      void reportOrderDebugClient("liff_missing_id", {
        href: typeof window === "undefined" ? "" : window.location.href,
      });
      return;
    }

    const initLiff = async () => {
      const startedAt = Date.now();
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
        setIsInClient(liff.isInClient());

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
          await refreshProfile();
        }

        const durationMs = Date.now() - startedAt;
        if (durationMs >= 1500) {
          void reportOrderDebugClient("liff_init_slow", {
            durationMs,
            isInClient: liff.isInClient(),
            isLoggedIn: liff.isLoggedIn(),
          });
        }

        setIsReady(true);
      } catch (err) {
        console.error("LIFF init error", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        void reportOrderDebugClient("liff_init_error", {
          error: summarizeError(err),
          href: typeof window === "undefined" ? "" : window.location.href,
        });
        setIsReady(true); // Still ready, just failed
      }
    };

    initLiff();
  }, [liffId, refreshProfile]);

  const login = async () => {
    const liff = liffRef.current;
    if (!liff || liff.isLoggedIn()) return;

    void reportOrderDebugClient("liff_login_click", {
      href: typeof window === "undefined" ? "" : window.location.href,
    });
    liff.login();

    // In mock mode there is no page redirect — update state manually
    if (process.env.NEXT_PUBLIC_LIFF_MOCK === "true") {
      try {
        await refreshProfile();
      } catch (err) {
        console.error("Mock login profile fetch error", err);
        void reportOrderDebugClient("liff_mock_login_profile_error", {
          error: summarizeError(err),
        });
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

  const closeWindow = () => {
    const liff = liffRef.current;
    if (liff) {
      liff.closeWindow();
    }
  };

  const sendMessages = async (messages: LiffSendMessagesParams) => {
    const liff = liffRef.current;
    if (!liff) throw new Error("LIFF not initialized");
    if (liff.isInClient() && liff.isApiAvailable("sendMessages")) {
      await liff.sendMessages(messages);
    } else {
      console.warn("sendMessages API is only available inside the LINE app. Logging message instead:", messages);
      throw new Error("sendMessages API is only available inside the LINE app");
    }
  };

  return (
    <LiffContext.Provider
      value={{
        isReady,
        isInClient,
        error,
        profile,
        liffToken,
        login,
        logout,
        closeWindow,
        refreshProfile,
        sendMessages,
      }}
    >
      {children}
    </LiffContext.Provider>
  );
}
