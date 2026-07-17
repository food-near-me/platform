"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_BEACHHEAD_ID,
  type BeachheadId,
} from "@/lib/near-me/beachheads";

type BeachheadContextValue = {
  cityId: BeachheadId;
  setCityId: (id: BeachheadId) => void;
};

const BeachheadContext = createContext<BeachheadContextValue>({
  cityId: DEFAULT_BEACHHEAD_ID,
  setCityId: () => {},
});

export function BeachheadProvider({ children }: { children: ReactNode }) {
  const [cityId, setCityIdState] = useState<BeachheadId>(DEFAULT_BEACHHEAD_ID);
  const setCityId = useCallback((id: BeachheadId) => {
    setCityIdState(id);
  }, []);
  const value = useMemo(() => ({ cityId, setCityId }), [cityId, setCityId]);
  return (
    <BeachheadContext.Provider value={value}>{children}</BeachheadContext.Provider>
  );
}

export function useBeachheadCity() {
  return useContext(BeachheadContext);
}
