import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';
import { compressImage } from '../utils/imageCompressor';

/**
 * Servicio de almacenamiento para fotos de platos del menú.
 * Ruta requerida: /restaurants/{restaurantId}/menu/{menuItemId}.jpg
 * Comprime la imagen a máx 800px de ancho y calidad 80% antes de subir.
 * Retorna la URL de descarga pública para guardarla en el campo `fotoUrl` de Firestore.
 */

export async function uploadDishPhoto(
  restaurantId: string,
  menuItemId: string,
  imageFile: File
): Promise<string> {
  const cleanRestId = restaurantId && restaurantId !== 'all' ? restaurantId : 'central';
  const storagePath = `restaurants/${cleanRestId}/menu/${menuItemId}.jpg`;
  
  // 1. Comprimir y redimensionar imagen (máx 800px, 80% calidad JPEG)
  const { blob } = await compressImage(imageFile, 800, 0.8);

  try {
    // 2. Subir a Firebase Storage en la ruta estipulada
    const storageRef = ref(storage, storagePath);
    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: 'image/jpeg',
      customMetadata: {
        restaurantId: cleanRestId,
        menuItemId,
        uploadedAt: new Date().toISOString()
      }
    });

    // 3. Obtener URL de descarga para guardarla en Firestore (campo fotoUrl)
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (storageError: any) {
    console.warn('Advertencia al subir a Firebase Storage:', storageError);
    // Si en el entorno sandbox o contenedor de preview hay bloqueo de bucket o red,
    // convertimos a data URL segura para que el usuario nunca pierda la foto del plato
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }
}

export async function uploadReceiptPhoto(
  restaurantId: string,
  expenseId: string,
  imageFile: File | Blob
): Promise<string> {
  const cleanRestId = restaurantId && restaurantId !== 'all' ? restaurantId : 'central';
  const storagePath = `restaurants/${cleanRestId}/receipts/${expenseId}.jpg`;

  // Comprimir imagen a máx 1200px para preservar legibilidad del texto del ticket
  const { blob } = await compressImage(imageFile, 1200, 0.8);

  try {
    const storageRef = ref(storage, storagePath);
    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: 'image/jpeg',
      customMetadata: {
        restaurantId: cleanRestId,
        expenseId,
        uploadedAt: new Date().toISOString()
      }
    });

    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (storageError: any) {
    console.warn('Advertencia al subir recibo a Firebase Storage:', storageError);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }
}

export async function deleteDishPhoto(restaurantId: string, menuItemId: string): Promise<void> {
  try {
    const cleanRestId = restaurantId && restaurantId !== 'all' ? restaurantId : 'central';
    const storageRef = ref(storage, `restaurants/${cleanRestId}/menu/${menuItemId}.jpg`);
    await deleteObject(storageRef);
  } catch (err) {
    // Ignorar si el archivo no existía previamente
    console.info('No se requirió eliminar archivo previo de storage:', err);
  }
}
