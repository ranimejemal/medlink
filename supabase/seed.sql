-- Demo data (fictional). Safe to re-run: existing rows are kept, and it adds slots for the NEXT 21 days each time.
insert into public.clinics(id,name,city,address,phone) values
 ('11111111-0000-0000-0000-000000000001','MedLink Sousse','Sousse','Avenue Léopold Sédar Senghor, Sousse (adresse fictive)','+216 73 000 001'),
 ('11111111-0000-0000-0000-000000000002','MedLink Sfax','Sfax','Route de Tunis km 2, Sfax (adresse fictive)','+216 74 000 002'),
 ('11111111-0000-0000-0000-000000000003','MedLink Tunis','Tunis','Rue du Lac Biwa, Les Berges du Lac (adresse fictive)','+216 71 000 003')
on conflict do nothing;

insert into public.specialties(id,name) values
 ('22222222-0000-0000-0000-000000000001','Médecine générale'),
 ('22222222-0000-0000-0000-000000000002','Cardiologie'),
 ('22222222-0000-0000-0000-000000000003','Dermatologie'),
 ('22222222-0000-0000-0000-000000000004','Pédiatrie'),
 ('22222222-0000-0000-0000-000000000005','Gynécologie'),
 ('22222222-0000-0000-0000-000000000006','Ophtalmologie')
on conflict do nothing;

insert into public.practitioners(id,first_name,last_name,specialty_id) values
 ('33333333-0000-0000-0000-000000000001','Amine','Ben Salah','22222222-0000-0000-0000-000000000002'),
 ('33333333-0000-0000-0000-000000000002','Sarra','Trabelsi','22222222-0000-0000-0000-000000000001'),
 ('33333333-0000-0000-0000-000000000003','Karim','Gharbi','22222222-0000-0000-0000-000000000003'),
 ('33333333-0000-0000-0000-000000000004','Leila','Mansour','22222222-0000-0000-0000-000000000004'),
 ('33333333-0000-0000-0000-000000000005','Hichem','Jaziri','22222222-0000-0000-0000-000000000005'),
 ('33333333-0000-0000-0000-000000000006','Nour','Haddad','22222222-0000-0000-0000-000000000006')
on conflict do nothing;

insert into public.practitioner_clinics values
 ('33333333-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001'),
 ('33333333-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000003'),
 ('33333333-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000002'),
 ('33333333-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000003'),
 ('33333333-0000-0000-0000-000000000004','11111111-0000-0000-0000-000000000001'),
 ('33333333-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000002'),
 ('33333333-0000-0000-0000-000000000006','11111111-0000-0000-0000-000000000003')
on conflict do nothing;

-- slots: next 21 days, weekdays, 09:00-12:00 & 14:00-16:00 Tunis time, every 30 min
insert into public.availability_slots(practitioner_id,clinic_id,starts_at,ends_at)
select pc.practitioner_id, pc.clinic_id, t, t + interval '30 minutes'
from public.practitioner_clinics pc
cross join generate_series(1,21) d
cross join (values ('09:00'),('09:30'),('10:00'),('10:30'),('11:00'),('11:30'),('14:00'),('14:30'),('15:00'),('15:30')) h(hh)
cross join lateral (select ((current_date + d)::text || ' ' || h.hh)::timestamp at time zone 'Africa/Tunis' as t) x
where extract(isodow from current_date + d) < 6
  and (abs(hashtext(pc.practitioner_id::text || pc.clinic_id::text)) + d) % 2 = 0
on conflict do nothing;

insert into public.account_invitations(email,role,practitioner_id) values
 ('doctor.demo@medlink.test','practitioner','33333333-0000-0000-0000-000000000001'),
 ('admin.demo@medlink.test','admin',null),
 ('staff.demo@medlink.test','staff',null)
on conflict do nothing;
