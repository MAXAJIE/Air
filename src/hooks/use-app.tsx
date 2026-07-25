import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";

export type AppRole = "owner" | "cleaner" | "worker" | "hr_company";

export type Profile = {
  user_id: string;
  email: string;
  username: string;
  display_name: string | null;
  primary_role: AppRole | null;
  self_secondary_role: "owner" | "cleaner" | "worker" | null;
};

export function useAuthUser() {
  return useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user ?? null;
    },
    staleTime: 30_000,
  });
}

export function useProfile() {
  const { data: user } = useAuthUser();
  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, email, username, display_name, primary_role, self_secondary_role")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });
}

export type WorkGroup = { id: string; name: string; relation: "owner" | "member" | "hr" };

/** Every owner group the signed-in user can currently work inside. */
export function useMyGroups() {
  const { data: user } = useAuthUser();
  return useQuery({
    queryKey: ["my-groups", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<WorkGroup[]> => {
      const [owned, memberships, hr] = await Promise.all([
        supabase.from("owner_groups").select("id, name").eq("owner_user_id", user!.id),
        supabase
          .from("memberships")
          .select("owner_group_id, owner_groups(id, name)")
          .eq("user_id", user!.id)
          .eq("status", "active"),
        supabase
          .from("hr_affiliations")
          .select("owner_group_id, owner_groups(id, name)")
          .eq("hr_company_user_id", user!.id)
          .eq("status", "active"),
      ]);

      const groups: WorkGroup[] = [];
      const seen = new Set<string>();
      const push = (id: string, name: string, relation: WorkGroup["relation"]) => {
        if (seen.has(id)) return;
        seen.add(id);
        groups.push({ id, name, relation });
      };

      for (const g of owned.data ?? []) push(g.id, g.name, "owner");
      for (const m of memberships.data ?? []) {
        const g = m.owner_groups as unknown as { id: string; name: string } | null;
        if (g) push(g.id, g.name, "member");
      }
      for (const a of hr.data ?? []) {
        const g = a.owner_groups as unknown as { id: string; name: string } | null;
        if (g) push(g.id, g.name, "hr");
      }
      return groups;
    },
  });
}

type ActiveGroupValue = {
  groupId: string | null;
  setGroupId: (id: string) => void;
  groups: WorkGroup[];
  loading: boolean;
};

const ActiveGroupContext = createContext<ActiveGroupValue | null>(null);
const STORAGE_KEY = "keyward.activeGroup";

export function ActiveGroupProvider({ children }: { children: ReactNode }) {
  const { data: groups, isLoading } = useMyGroups();
  const [groupId, setGroupIdState] = useState<string | null>(null);

  useEffect(() => {
    if (!groups || groups.length === 0) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const valid = stored && groups.some((g) => g.id === stored) ? stored : groups[0].id;
    setGroupIdState((current) => (current && groups.some((g) => g.id === current) ? current : valid));
  }, [groups]);

  const value = useMemo<ActiveGroupValue>(
    () => ({
      groupId,
      groups: groups ?? [],
      loading: isLoading,
      setGroupId: (id: string) => {
        setGroupIdState(id);
        window.localStorage.setItem(STORAGE_KEY, id);
      },
    }),
    [groupId, groups, isLoading],
  );

  return <ActiveGroupContext.Provider value={value}>{children}</ActiveGroupContext.Provider>;
}

export function useActiveGroup() {
  const ctx = useContext(ActiveGroupContext);
  if (!ctx) throw new Error("useActiveGroup must be used inside ActiveGroupProvider");
  return ctx;
}
