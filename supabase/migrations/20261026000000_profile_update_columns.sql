-- Fix: "own profile update" let any user change every column of their own row,
-- including is_active (a deactivated user could re-activate themselves) and email.
-- Users may now only edit their contact details; is_active is changed by admin_set_active().
revoke update on public.profiles from authenticated;
grant update (first_name, last_name, phone, date_of_birth, updated_at) on public.profiles to authenticated;