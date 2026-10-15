alter table public.profiles
  drop constraint if exists profiles_referred_by_fkey;

alter table public.profiles
  add constraint profiles_referred_by_fkey
    foreign key (referred_by)
    references public.profiles(id)
    on delete set null;
