import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type MembershipRole = Database["public"]["Enums"]["membership_role"];

export type GroupMember = {
  user_id: string;
  name: string;
  username: string | null;
  email: string | null;
  roles: MembershipRole[];
};

/**
 * Roster of active members of a group, optionally narrowed to given roles.
 *
 * `memberships.user_id` has no foreign key to `profiles`, so PostgREST cannot
 * embed the profile rows (an embed here silently returns nothing — that was the
 * "cleaners are not detected" bug). We fetch both tables and join in memory.
 */
export function useGroupMembers(groupId: string | null | undefined, roles?: MembershipRole[]) {
  const roleKey = roles ? [...roles].sort().join(",") : "all";
  return useQuery({
    queryKey: ["group-members", groupId, roleKey],
    enabled: !!groupId,
    queryFn: async (): Promise<GroupMember[]> => {
      let q = supabase
        .from("memberships")
        .select("user_id, role")
        .eq("owner_group_id", groupId!)
        .eq("status", "active");
      if (roles && roles.length > 0) q = q.in("role", roles);
      const { data: rows, error } = await q;
      if (error) throw error;

      const byUser = new Map<string, MembershipRole[]>();
      for (const row of rows ?? []) {
        const list = byUser.get(row.user_id) ?? [];
        list.push(row.role);
        byUser.set(row.user_id, list);
      }
      const userIds = [...byUser.keys()];
      if (userIds.length === 0) return [];

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, email")
        .in("user_id", userIds);
      if (profileError) throw profileError;

      const profileById = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      return userIds
        .map((userId) => {
          const profile = profileById.get(userId);
          return {
            user_id: userId,
            name: profile?.display_name || profile?.username || userId.slice(0, 8),
            username: profile?.username ?? null,
            email: profile?.email ?? null,
            roles: byUser.get(userId) ?? [],
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}
