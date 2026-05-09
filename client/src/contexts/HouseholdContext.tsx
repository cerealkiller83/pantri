import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "pantri.activeHouseholdId";

interface HouseholdContextValue {
  /** ID of the household currently selected (or null if none / multiple available) */
  activeHouseholdId: number | null;
  /** Set the active household, persisting to localStorage */
  setActiveHouseholdId: (id: number | null) => void;
}

const HouseholdContext = createContext<HouseholdContextValue | undefined>(undefined);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const [activeHouseholdId, setActiveHouseholdIdState] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const n = Number(stored);
    return Number.isFinite(n) && n > 0 ? n : null;
  });

  const setActiveHouseholdId = useCallback((id: number | null) => {
    setActiveHouseholdIdState(id);
    if (typeof window === "undefined") return;
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(id));
    }
  }, []);

  // Cross-tab sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = e.newValue ? Number(e.newValue) : null;
      setActiveHouseholdIdState(Number.isFinite(next as number) ? (next as number) : null);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const value = useMemo(
    () => ({ activeHouseholdId, setActiveHouseholdId }),
    [activeHouseholdId, setActiveHouseholdId]
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useActiveHousehold() {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error("useActiveHousehold must be used inside <HouseholdProvider>");
  return ctx;
}
