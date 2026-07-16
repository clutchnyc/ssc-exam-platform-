import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  // session: undefined = still resolving, null = signed out
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setProfile(data ?? null);
          setProfileLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function createProfile(fullName) {
    const { data, error } = await supabase
      .from("profiles")
      .insert({ id: userId, full_name: fullName })
      .select("id, full_name, role")
      .single();
    if (error) throw error;
    setProfile(data);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthCtx.Provider
      value={{ session, user: session?.user ?? null, profile, profileLoading, createProfile, signOut }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
