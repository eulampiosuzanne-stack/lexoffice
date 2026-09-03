-- Storage reads/updates must follow record ownership, not only organization folder.

drop policy if exists lexoffice_documents_select on storage.objects;
create policy lexoffice_documents_select on storage.objects
for select to authenticated
using (
  bucket_id='lexoffice-documents'
  and (storage.foldername(name))[1]=current_org_id()::text
  and (
    exists(select 1 from public.documents d where d.org_id=current_org_id() and d.owner_user_id=auth.uid() and d.file_path=name)
    or exists(select 1 from public.generated_documents g where g.org_id=current_org_id() and g.owner_user_id=auth.uid() and (g.storage_path=name or g.variables->>'filled_docx_path'=name))
    or exists(select 1 from public.document_templates t where t.org_id=current_org_id() and t.sample_file_path=name)
    or exists(select 1 from public.organization_settings s where s.org_id=current_org_id() and s.logo_storage_path=name)
  )
);

drop policy if exists lexoffice_documents_update on storage.objects;
create policy lexoffice_documents_update on storage.objects
for update to authenticated
using (
  bucket_id='lexoffice-documents'
  and (storage.foldername(name))[1]=current_org_id()::text
  and (
    exists(select 1 from public.documents d where d.org_id=current_org_id() and d.owner_user_id=auth.uid() and d.file_path=name)
    or exists(select 1 from public.generated_documents g where g.org_id=current_org_id() and g.owner_user_id=auth.uid() and (g.storage_path=name or g.variables->>'filled_docx_path'=name))
  )
)
with check (bucket_id='lexoffice-documents' and (storage.foldername(name))[1]=current_org_id()::text);

drop policy if exists lexoffice_documents_delete on storage.objects;
create policy lexoffice_documents_delete on storage.objects
for delete to authenticated
using (
  bucket_id='lexoffice-documents'
  and (storage.foldername(name))[1]=current_org_id()::text
  and (
    exists(select 1 from public.documents d where d.org_id=current_org_id() and d.owner_user_id=auth.uid() and d.file_path=name)
    or exists(select 1 from public.generated_documents g where g.org_id=current_org_id() and g.owner_user_id=auth.uid() and (g.storage_path=name or g.variables->>'filled_docx_path'=name))
  )
);
