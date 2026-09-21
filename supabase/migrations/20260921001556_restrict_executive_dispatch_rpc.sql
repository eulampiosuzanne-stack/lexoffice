revoke all on function public.lexoffice_executive_cycle(uuid) from public, anon, authenticated;
revoke all on function public.lexoffice_executive_dispatch(uuid) from public, anon, authenticated;
revoke all on function public.lexoffice_executive_dispatch(uuid, text) from public, anon, authenticated;

grant execute on function public.lexoffice_executive_cycle(uuid) to service_role;
grant execute on function public.lexoffice_executive_dispatch(uuid) to service_role;
grant execute on function public.lexoffice_executive_dispatch(uuid, text) to service_role;
