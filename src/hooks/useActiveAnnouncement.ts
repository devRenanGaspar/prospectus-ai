import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Announcement {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

export const useActiveAnnouncement = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const profileCreatedAt = user?.created_at ?? null;

  const query = useQuery({
    queryKey: ["active-announcement", userId, profileCreatedAt],
    enabled: !!userId && !!profileCreatedAt,
    staleTime: 60_000,
    queryFn: async (): Promise<Announcement | null> => {
      if (!userId || !profileCreatedAt) return null;

      // Get all active announcements created after the user signed up
      const { data: announcements, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("is_active", true)
        .gt("created_at", profileCreatedAt)
        .order("created_at", { ascending: true });

      if (error) throw error;
      if (!announcements || announcements.length === 0) return null;

      // Filter out ones already dismissed by this user
      const ids = announcements.map((a) => a.id);
      const { data: dismissals, error: dErr } = await supabase
        .from("announcement_dismissals")
        .select("announcement_id")
        .eq("user_id", userId)
        .in("announcement_id", ids);

      if (dErr) throw dErr;

      const dismissedIds = new Set((dismissals ?? []).map((d) => d.announcement_id));
      const next = announcements.find((a) => !dismissedIds.has(a.id));
      return next ?? null;
    },
  });

  const dismiss = useMutation({
    mutationFn: async (announcementId: string) => {
      if (!userId) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("announcement_dismissals")
        .insert({ announcement_id: announcementId, user_id: userId });
      if (error && error.code !== "23505") throw error; // ignore duplicate
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-announcement"] });
    },
  });

  return { announcement: query.data ?? null, isLoading: query.isLoading, dismiss };
};
