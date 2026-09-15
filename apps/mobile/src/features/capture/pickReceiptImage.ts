/**
 * pickReceiptImage — photo-library entry for receipt / grocery-order screenshots.
 *
 * Camera capture stays on ScanScreen; this is the "I already have a picture"
 * path (Instacart order screenshot, paper receipt in Photos). Images stay on
 * device — only the local URI is returned for on-device OCR.
 */
import * as ImagePicker from 'expo-image-picker';

export class PhotoLibraryDeniedError extends Error {
  constructor() {
    super('Photo access is off — enable Photos for this app to read a receipt.');
    this.name = 'PhotoLibraryDeniedError';
  }
}

/** Open the system picker. Returns a local image URI, or null if the user canceled. */
export async function pickReceiptImage(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PhotoLibraryDeniedError();

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsMultipleSelection: false,
  });
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}
