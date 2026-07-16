import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False until .env has real Supabase credentials. */
export const isConfigured = Boolean(url && key);

export const supabase = isConfigured ? createClient(url, key) : null;

/**
 * Invoke an Edge Function and surface its JSON error message on failure.
 */
export async function invokeFn(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message || "Request failed";
    let code = null;
    try {
      const j = await error.context.json();
      if (j?.error) message = j.error;
      if (j?.code) code = j.code;
    } catch {
      /* no JSON body */
    }
    const e = new Error(message);
    e.code = code;
    throw e;
  }
  return data;
}
