drop policy if exists lexoffice_documents_select on storage.objects;
create policy lexoffice_documents_select on storage.objects
for select to authenticated
using (
  bucket_id='lexoffice-documents'
  and (
    (storage.foldername(storage.objects.name))[1]=current_org_id()::text
    or (
      (storage.foldername(storage.objects.name))[1]='signatures'
      and (storage.foldername(storage.objects.name))[2]=current_org_id()::text
    )
  )
  and (
    exists(select 1 from public.documents d where d.org_id=current_org_id() and d.owner_user_id=auth.uid() and d.file_path=storage.objects.name)
    or exists(select 1 from public.generated_documents g where g.org_id=current_org_id() and g.owner_user_id=auth.uid() and (g.storage_path=storage.objects.name or g.variables->>'filled_docx_path'=storage.objects.name))
    or exists(select 1 from public.document_templates t where t.org_id=current_org_id() and t.sample_file_path=storage.objects.name)
    or exists(select 1 from public.organization_settings s where s.org_id=current_org_id() and s.logo_storage_path=storage.objects.name)
  )
);
