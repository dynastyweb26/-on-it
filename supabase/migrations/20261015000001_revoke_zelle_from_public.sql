revoke execute on function public.set_zelle(uuid, text, text) from public;
revoke execute on function public.get_zelle(uuid, text) from public;
revoke execute on function public.set_zelle(uuid, text, text) from anon, authenticated;
revoke execute on function public.get_zelle(uuid, text) from anon, authenticated;
grant execute on function public.set_zelle(uuid, text, text) to service_role;
grant execute on function public.get_zelle(uuid, text) to service_role;
