-- Create the storage bucket for shop logos and assets
insert into storage.buckets (id, name, public)
values ('shop-assets', 'shop-assets', true);

-- Allow public read access to all files in the bucket
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'shop-assets' );

-- Allow authenticated users to upload files
create policy "Authenticated users can upload"
  on storage.objects for insert
  with check ( bucket_id = 'shop-assets' and auth.role() = 'authenticated' );

-- Allow authenticated users to update their files
create policy "Authenticated users can update"
  on storage.objects for update
  with check ( bucket_id = 'shop-assets' and auth.role() = 'authenticated' );

-- Allow authenticated users to delete files
create policy "Authenticated users can delete"
  on storage.objects for delete
  using ( bucket_id = 'shop-assets' and auth.role() = 'authenticated' );
