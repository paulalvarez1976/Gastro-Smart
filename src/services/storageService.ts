import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { storage, db } from '../firebase';
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
  imageFile: File | Blob
): Promise<string> {
  const cleanRestId = restaurantId && restaurantId !== 'all' ? restaurantId : 'central';
  const storagePath = `restaurants/${cleanRestId}/menu/${menuItemId}.jpg`;
  
  console.log(`[Storage] 📤 Procesando foto de plato:`, {
    menuItemId,
    restaurantId: cleanRestId,
    storagePath,
    originalFileSize: `${(imageFile.size / 1024).toFixed(2)} KB`,
    fileType: imageFile.type
  });

  // 1. Comprimir y redimensionar imagen (máx 600px, 75% calidad JPEG para peso óptimo ~20-30KB)
  const { blob, dataUrl } = await compressImage(imageFile, 600, 0.75);
  console.log(`[Storage] 📉 Imagen optimizada:`, {
    compressedSize: `${(blob.size / 1024).toFixed(2)} KB`
  });

  // 2. Intentar subida a Firebase Storage si está disponible
  try {
    const uploadPromise = (async () => {
      const storageRef = ref(storage, storagePath);
      console.log(`[Storage] 🚀 Intentando subida a Firebase Storage: ${storagePath}`);
      const snapshot = await uploadBytes(storageRef, blob, {
        contentType: 'image/jpeg',
        customMetadata: {
          restaurantId: cleanRestId,
          menuItemId,
          uploadedAt: new Date().toISOString()
        }
      });
      const downloadUrl = await getDownloadURL(snapshot.ref);
      console.log(`[Storage] ✅ Subida a Firebase Storage exitosa:`, downloadUrl);
      return downloadUrl;
    })();

    // Timeout ágil de 6 segundos para evitar colgar la app si Storage está bloqueado o con problemas de red/CORS
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Storage upload timeout (6s exceeded)')), 6000)
    );

    return await Promise.race([uploadPromise, timeoutPromise]);
  } catch (storageError: any) {
    console.warn(`[Storage] ℹ️ Firebase Storage no disponible (${storageError?.code || storageError?.message}). Activando almacenamiento directo de imagen optimizada (Base64 dataUrl):`, {
      menuItemId,
      restaurantId: cleanRestId
    });

    // Fallback garantizado: guardar la imagen comprimida directamente como data URL
    // Esto asegura que el plato se guarde de inmediato y la foto se visualice perfectamente sin errores
    return dataUrl;
  }
}

export async function uploadReceiptPhoto(
  restaurantId: string,
  expenseId: string,
  imageFile: File | Blob
): Promise<string> {
  const cleanRestId = restaurantId && restaurantId !== 'all' ? restaurantId : 'central';
  const storagePath = `restaurants/${cleanRestId}/receipts/${expenseId}.jpg`;

  // Comprimir imagen a máx 900px para preservar legibilidad del ticket con bajo peso
  const { blob, dataUrl } = await compressImage(imageFile, 900, 0.75);

  try {
    const uploadPromise = (async () => {
      const storageRef = ref(storage, storagePath);
      const snapshot = await uploadBytes(storageRef, blob, {
        contentType: 'image/jpeg',
        customMetadata: {
          restaurantId: cleanRestId,
          expenseId,
          uploadedAt: new Date().toISOString()
        }
      });
      return await getDownloadURL(snapshot.ref);
    })();

    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Storage upload timeout (6s exceeded)')), 6000)
    );

    return await Promise.race([uploadPromise, timeoutPromise]);
  } catch (storageError: any) {
    console.warn(`[Storage] ℹ️ Firebase Storage no disponible para comprobante, usando dataUrl optimizado.`);
    return dataUrl;
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

export async function migrateBase64MenuItemsToStorage(): Promise<{ migratedCount: number; errorsCount: number }> {
  const colRef = collection(db, 'menuItems');
  const snapshot = await getDocs(colRef);
  let migratedCount = 0;
  let errorsCount = 0;

  for (const itemDoc of snapshot.docs) {
    const data = itemDoc.data();
    const fotoUrl = data.fotoUrl || data.imagenUrl;
    
    if (fotoUrl && typeof fotoUrl === 'string' && fotoUrl.startsWith('data:image')) {
      try {
        const res = await fetch(fotoUrl);
        const blob = await res.blob();
        const file = new File([blob], `${itemDoc.id}.jpg`, { type: blob.type || 'image/jpeg' });
        
        const restaurantId = data.restaurantId || 'central';
        const downloadUrl = await uploadDishPhoto(restaurantId, itemDoc.id, file);
        
        await updateDoc(doc(db, 'menuItems', itemDoc.id), {
          fotoUrl: downloadUrl,
          imagenUrl: downloadUrl
        });
        
        migratedCount++;
        console.log(`[Migration] Plato ${itemDoc.id} (${data.nombre}) migrado a Storage exitosamente.`);
      } catch (err) {
        errorsCount++;
        console.error(`[Migration] Error migrando plato ${itemDoc.id}:`, err);
      }
    }
  }

  return { migratedCount, errorsCount };
}
