'use client';

import { useState } from 'react';
import { type User } from '@supabase/supabase-js';
import { useSupabase } from './useSupabase';

type SignUpInput = {
  email: string;
  password: string;
};

type SetUpProfileInput = {
  firstName: string;
  lastName: string;
  dob: string; // yyyy-mm-dd
  userId?: string; // optional if you already have it
};

type SignInInput = {
  email: string;
  password: string;
};

export function useAuth() {
  const supabase = useSupabase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async ({ email, password }: SignInInput) => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return { user: null, error };
    }

    return { user: data.user, error: null };
  };

  // Screen 1: credentials only
  const signUp = async ({ email, password }: SignUpInput) => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return { user: null, session: null, error };
    }

    return { user: data.user, session: data.session, error: null };
  };

  // Screen 2: profile data
  const setUpProfile = async ({ firstName, lastName, dob, userId }: SetUpProfileInput) => {
    setLoading(true);
    setError(null);

    let resolvedUserId = userId;

    if (!resolvedUserId) {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        setLoading(false);
        const err = userError ?? new Error('No authenticated user found.');
        setError(err.message);
        return { error: err };
      }
      resolvedUserId = userData.user.id;
    }

    // upsert handles both "first insert" and "edit profile later"
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: resolvedUserId,
          first_name: firstName || null,
          last_name: lastName || null,
          dob: dob || null,
        },
        { onConflict: 'user_id' }
      );

    setLoading(false);

    if (profileError) {
      setError(profileError.message);
      return { error: profileError };
    }

    return { error: null };
  };

  const signOut = async () => {
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signOut();

    setLoading(false);

    if (error) {
      setError(error.message);
      return { error };
    }

    return { error: null };
  };

  const getCurrentUser = async (): Promise<User | null> => {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user ?? null;
  };

  return {
    loading,
    error,
    signIn,
    signUp,
    setUpProfile,
    signOut,
    getCurrentUser,
  };
}