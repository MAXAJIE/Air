-- Air fixes: photo storage without service role, profile avatar + display-name cooldown.

-- ============ storage: private photos bucket reachable with the user's own token ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "photos read for signed in" ON storage.objects;
CREATE POLICY "photos read for signed in" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'photos');

DROP POLICY IF EXISTS "photos insert own folder" ON storage.objects;
CREATE POLICY "photos insert own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'photos' AND (storage.foldername(name))[2] = auth.uid()::text);

DROP POLICY IF EXISTS "photos update own folder" ON storage.objects;
CREATE POLICY "photos update own folder" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'photos' AND (storage.foldername(name))[2] = auth.uid()::text)
  WITH CHECK (bucket_id = 'photos' AND (storage.foldername(name))[2] = auth.uid()::text);

DROP POLICY IF EXISTS "photos delete own folder" ON storage.objects;
CREATE POLICY "photos delete own folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'photos' AND (storage.foldername(name))[2] = auth.uid()::text);

-- ============ profiles: avatar + display name cooldown ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS display_name_updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.enforce_display_name_cooldown()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    IF OLD.display_name_updated_at IS NOT NULL
       AND OLD.display_name_updated_at > now() - interval '7 days' THEN
      RAISE EXCEPTION 'Your name can only be changed once every 7 days';
    END IF;
    NEW.display_name_updated_at := now();
  ELSE
    NEW.display_name_updated_at := OLD.display_name_updated_at;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_display_name_cooldown ON public.profiles;
CREATE TRIGGER profiles_display_name_cooldown
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_display_name_cooldown();
