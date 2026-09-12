create or replace function public.guard_signature_request_icp_finalization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.icp_validated_document_id is distinct from old.icp_validated_document_id
     and new.icp_validated_document_id is not null then
    if not exists (
      select 1
      from public.icp_signature_audit a
      join public.documents d on d.id = a.document_id
      where a.org_id = new.org_id
        and a.signature_request_id = new.id
        and a.document_id = new.icp_validated_document_id
        and a.validation_status = 'valid'
        and coalesce(a.certificate_fingerprint, '') <> ''
        and coalesce(a.document_hash_sha256, '') <> ''
        and d.org_id = new.org_id
        and d.id = new.icp_validated_document_id
        and d.mime_type = 'application/pdf'
        and d.category = 'Documento final assinado ICP-Brasil'
    ) then
      raise exception 'ICP-Brasil finalization requires a valid audit record for the same PDF' using errcode='23514';
    end if;
    new.icp_validated_at := coalesce(new.icp_validated_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_signature_request_icp_finalization on public.signature_requests;
create trigger trg_guard_signature_request_icp_finalization
before update of icp_validated_document_id on public.signature_requests
for each row execute function public.guard_signature_request_icp_finalization();

revoke all on function public.guard_signature_request_icp_finalization() from public, anon, authenticated;
