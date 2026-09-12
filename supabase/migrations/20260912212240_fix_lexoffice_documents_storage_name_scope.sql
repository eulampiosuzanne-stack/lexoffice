-- Fix an outer-column shadowing bug in lexoffice-documents policies.
-- Inside the correlated subqueries, the unqualified `name` was being resolved
-- against inner tables (for example documents.name) instead of storage.objects.name.

DROP POLICY IF EXISTS lexoffice_documents_select ON storage.objects;
CREATE POLICY lexoffice_documents_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'lexoffice-documents'
  AND (storage.foldername(storage.objects.name))[1] = current_org_id()::text
  AND (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.org_id = current_org_id()
        AND d.owner_user_id = auth.uid()
        AND d.file_path = storage.objects.name
    )
    OR EXISTS (
      SELECT 1 FROM public.generated_documents g
      WHERE g.org_id = current_org_id()
        AND g.owner_user_id = auth.uid()
        AND (g.storage_path = storage.objects.name OR g.variables->>'filled_docx_path' = storage.objects.name)
    )
    OR EXISTS (
      SELECT 1 FROM public.document_templates t
      WHERE t.org_id = current_org_id()
        AND t.sample_file_path = storage.objects.name
    )
    OR EXISTS (
      SELECT 1 FROM public.organization_settings s
      WHERE s.org_id = current_org_id()
        AND s.logo_storage_path = storage.objects.name
    )
  )
);

DROP POLICY IF EXISTS lexoffice_documents_update ON storage.objects;
CREATE POLICY lexoffice_documents_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'lexoffice-documents'
  AND (storage.foldername(storage.objects.name))[1] = current_org_id()::text
  AND (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.org_id = current_org_id()
        AND d.owner_user_id = auth.uid()
        AND d.file_path = storage.objects.name
    )
    OR EXISTS (
      SELECT 1 FROM public.generated_documents g
      WHERE g.org_id = current_org_id()
        AND g.owner_user_id = auth.uid()
        AND (g.storage_path = storage.objects.name OR g.variables->>'filled_docx_path' = storage.objects.name)
    )
  )
)
WITH CHECK (
  bucket_id = 'lexoffice-documents'
  AND (storage.foldername(storage.objects.name))[1] = current_org_id()::text
);

DROP POLICY IF EXISTS lexoffice_documents_delete ON storage.objects;
CREATE POLICY lexoffice_documents_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'lexoffice-documents'
  AND (storage.foldername(storage.objects.name))[1] = current_org_id()::text
  AND (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.org_id = current_org_id()
        AND d.owner_user_id = auth.uid()
        AND d.file_path = storage.objects.name
    )
    OR EXISTS (
      SELECT 1 FROM public.generated_documents g
      WHERE g.org_id = current_org_id()
        AND g.owner_user_id = auth.uid()
        AND (g.storage_path = storage.objects.name OR g.variables->>'filled_docx_path' = storage.objects.name)
    )
  )
);
