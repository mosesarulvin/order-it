-- Create the storage bucket for promotions (idempotent)
INSERT INTO storage.buckets (id, name, public) VALUES ('promotions', 'promotions', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Promotions Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'promotions');

-- Allow authenticated users to upload
CREATE POLICY "Promotions Auth Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'promotions' AND auth.role() = 'authenticated');

-- Allow authenticated users to update
CREATE POLICY "Promotions Auth Update" ON storage.objects FOR UPDATE USING (bucket_id = 'promotions' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete
CREATE POLICY "Promotions Auth Delete" ON storage.objects FOR DELETE USING (bucket_id = 'promotions' AND auth.role() = 'authenticated');
