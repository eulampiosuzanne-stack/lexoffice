drop policy if exists lexoffice_documents_insert on storage.objects;
create policy lexoffice_documents_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='lexoffice-documents'
  and (
    (storage.foldername(storage.objects.name))[1]=current_org_id()::text
    or (
      (storage.foldername(storage.objects.name))[1]='signatures'
      and (storage.foldername(storage.objects.name))[2]=current_org_id()::text
    )
  )
);
