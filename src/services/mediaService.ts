import { supabase } from '../lib/supabase';

export interface MediaUploadResult {
  id: string;
  file_name: string;
  file_type: 'image' | 'video';
  file_url: string;
  file_size: number;
  thumbnail_url: string | null;
}

export async function uploadMedia(
  file: File,
  userId: string
): Promise<MediaUploadResult> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  const filePath = `${userId}/${fileName}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('media')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from('media')
    .getPublicUrl(filePath);

  const fileType = file.type.startsWith('video/') ? 'video' : 'image';

  const { data: mediaData, error: dbError } = await supabase
    .from('media_library')
    .insert({
      user_id: userId,
      file_name: file.name,
      file_type: fileType,
      file_url: publicUrl,
      file_size: file.size,
      thumbnail_url: null,
    })
    .select()
    .single();

  if (dbError) {
    await supabase.storage.from('media').remove([filePath]);
    throw new Error(`Database insert failed: ${dbError.message}`);
  }

  return mediaData;
}

export async function deleteMedia(mediaId: string, userId: string): Promise<void> {
  const { data: media, error: fetchError } = await supabase
    .from('media_library')
    .select('file_url')
    .eq('id', mediaId)
    .eq('user_id', userId)
    .single();

  if (fetchError) throw fetchError;

  const urlParts = media.file_url.split('/');
  const filePath = `${userId}/${urlParts[urlParts.length - 1]}`;

  const { error: storageError } = await supabase.storage
    .from('media')
    .remove([filePath]);

  if (storageError) {
    console.error('Storage deletion error:', storageError);
  }

  const { error: dbError } = await supabase
    .from('media_library')
    .delete()
    .eq('id', mediaId)
    .eq('user_id', userId);

  if (dbError) throw dbError;
}
