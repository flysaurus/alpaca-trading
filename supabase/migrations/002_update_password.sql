-- Run this in Supabase SQL Editor to add the password update function
CREATE OR REPLACE FUNCTION public.vault_update_password(p_user_id uuid, p_master_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.users SET master_password_hash = p_master_hash WHERE id = p_user_id;
END;
$$;
