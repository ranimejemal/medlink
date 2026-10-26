-- Staff may invite practitioners and staff (admin_invite_user), so they must also
-- see and cancel those invitations. Admin invitations stay admin-only.
drop policy if exists "staff read invitations" on public.account_invitations;
drop policy if exists "staff cancel invitations" on public.account_invitations;
drop policy if exists "staff invitations read" on public.account_invitations;
drop policy if exists "staff invitations delete" on public.account_invitations;

create policy "staff read invitations" on public.account_invitations for select to authenticated
  using (public.is_staff() and role in ('practitioner','staff'));
create policy "staff cancel invitations" on public.account_invitations for delete to authenticated
  using (public.is_staff() and role in ('practitioner','staff'));