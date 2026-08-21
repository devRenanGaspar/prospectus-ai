import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

/**
 * Whether `profile` has been settled yet.
 *
 * `loading` and a null `profile` are not the same thing as "this user has no
 * profile": the fetch is deliberately not awaited before `loading` flips to
 * false, so there is always at least one render with a session and no profile.
 * Anything that makes an authorization decision from `profile` must wait for
 * `resolved` instead of reading null as a denial -- see ProtectedRoute.
 */
export type ProfileStatus = "loading" | "resolved" | "error";

export interface Profile { id: string; full_name: string | null; role: string; credits_balance: number; plan_id: string | null; whatsapp_status: string; whatsapp_number: string | null; whatsapp_number_last: string | null; whatsapp_photo: string | null; agency_name: string; context_persona: string | null; context_icp: Record<string, unknown> | null; context_qualification: Record<string, unknown> | null; context_faq: Array<{ pergunta: string; resposta: string }> | null; google_calendar_email: string | null; google_calendar_connected_at: string | null; sdr_phone: string | null; sdr_availability: Record<string, unknown> | null; sdr_name: string | null; onboarding_completed: boolean; n8n_workflow_id: string | null; lgpd_consents: Record<string, boolean> | null; lgpd_consents_updated_at: string | null }

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  profileStatus: ProfileStatus;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("loading");
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, credits_balance, plan_id, whatsapp_status, whatsapp_number, whatsapp_number_last, whatsapp_photo, agency_name, context_persona, context_icp, context_qualification, context_faq, google_calendar_email, google_calendar_connected_at, sdr_phone, sdr_availability, sdr_name, onboarding_completed, n8n_workflow_id, lgpd_consents, lgpd_consents_updated_at")
        .eq("id", userId)
        .single();

      if (error || !data) {
        // A BLOCKED user can't read their own profile (RLS requires
        // is_active_user), so we find the role through the SECURITY DEFINER RPC.
        //
        // The `error` used to be dropped here. A failed RPC produced an
        // undefined `role`, which reads the same as "not blocked" -- so a
        // BLOCKED user whose RPC call failed fell through to the branch below
        // and was handled as a transient failure. Now the two are told apart:
        // if the RPC itself failed, this is an error state, not evidence about
        // the role.
        const { data: role, error: roleError } = await supabase.rpc("get_current_user_role");
        if (roleError) {
          console.error("fetchProfile role lookup failed:", roleError);
          setProfileStatus("error");
          return;
        }
        if (role === "BLOCKED") {
          // A BLOCKED profile is otherwise unreadable under RLS, so only id
          // and role are real; the rest are placeholders. Safe because
          // ProtectedRoute signs the user out and renders nothing else the
          // instant it sees this role -- no consumer reads another field.
          setProfile({
            id: userId, role: "BLOCKED", full_name: null, credits_balance: 0,
            plan_id: null, whatsapp_status: "", whatsapp_number: null,
            whatsapp_number_last: null, whatsapp_photo: null, agency_name: "",
            context_persona: null, context_icp: null, context_qualification: null,
            context_faq: null, google_calendar_email: null, google_calendar_connected_at: null,
            sdr_phone: null, sdr_availability: null, sdr_name: null,
            onboarding_completed: false, n8n_workflow_id: null,
            lgpd_consents: null, lgpd_consents_updated_at: null,
          });
          setProfileStatus("resolved");
          return;
        }
        // Transient failure (network, RPC down): do NOT clear the current
        // profile. It used to fall through to setProfile(null) and the UI
        // treated that as "no profile".
        console.error("fetchProfile failed:", error);
        setProfileStatus("error");
        return;
      }

      // The jsonb columns (context_icp, context_qualification, context_faq,
      // sdr_availability, lgpd_consents) are typed generically as `Json` by
      // the generator; the app's contract is that they always hold the
      // structured shape Profile declares.
      setProfile(data as unknown as Profile);
      setProfileStatus("resolved");
    } catch (err) {
      // Never leave the status on "loading": a consumer waiting for it would
      // hang on a spinner forever.
      console.error("fetchProfile threw:", err);
      setProfileStatus("error");
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  }, [fetchProfile, user]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // Synchronously, before the deferred fetch: the render that happens
          // between here and the fetch resolving must not look "settled".
          setProfileStatus("loading");
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          setProfile(null);
          setProfileStatus("resolved");
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setProfileStatus("loading");
        fetchProfile(session.user.id);
      } else {
        setProfileStatus("resolved");
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, profileStatus, loading, signIn, signUp, signOut, resetPassword, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
