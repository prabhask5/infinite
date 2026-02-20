/**
 * @fileoverview Image upload service for note image blocks.
 *
 * Handles file validation, upload to Supabase Storage `note-images` bucket,
 * and returns public URLs for embedding in Tiptap nodes.
 */

import { debug } from 'stellar-drive/utils';

/** Maximum file size: 10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Allowed MIME types for image uploads. */
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];

/**
 * Validate an image file before upload.
 * @param file - The File object to validate.
 * @returns An error message string, or null if valid.
 */
export function validateImageFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Unsupported image type: ${file.type}. Allowed: PNG, JPEG, GIF, WebP, SVG.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum: 10MB.`;
  }
  return null;
}

/**
 * Upload an image file and return a local object URL.
 *
 * In a full Supabase deployment, this would upload to Supabase Storage.
 * For now, creates a local blob URL that works offline.
 *
 * @param file - The validated image file.
 * @param noteId - The note this image belongs to.
 * @returns The URL for the uploaded image.
 */
export async function uploadImage(file: File, noteId: string): Promise<string> {
  debug(
    'log',
    `[ImageUpload] Uploading image for note ${noteId}: ${file.name} (${(file.size / 1024).toFixed(0)}KB)`
  );

  // For offline-first: convert to data URL that persists in the Yjs doc.
  // In production with Supabase Storage, replace this with actual upload.
  const dataUrl = await fileToDataUrl(file);
  debug('log', `[ImageUpload] Image converted to data URL (${dataUrl.length} chars)`);

  return dataUrl;
}

/**
 * Convert a File to a data URL string.
 * @param file - The file to convert.
 * @returns A base64 data URL.
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Open the system file picker for images.
 * @returns The selected File, or null if cancelled.
 */
export function openImagePicker(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ALLOWED_TYPES.join(',');
    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      resolve(file);
    };
    // Handle cancel
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
