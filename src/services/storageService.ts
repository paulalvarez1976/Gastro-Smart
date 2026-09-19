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
  imageFile: File
): Promise<string> {
  const cleanRestId = restaurantId && restaurantId !== 'all' ? restaurantId : 'central';
  const storagePath = `restaurants/${cleanRestId}/menu/${menuItemId}.jpg`;
  
  console.log(`[Storage] 📤 Iniciando subida de foto de plato:`, {
    menuItemId,
    restaurantId: cleanRestId,
    storagePath,
    originalFileName: imageFile.name,
    originalFileSize: `${(imageFile.size / 1024).toFixed(2)} KB`,
    fileType: imageFile.type
  });

  // 1. Comprimir y redimensionar imagen (máx 800px, 80% calidad JPEG)
  const { blob } = await compressImage(imageFile, 800, 0.8);
  console.log(`[Storage] 📉 Imagen comprimida con éxito:`, {
    compressedSize: `${(blob.size / 1024).toFixed(2)} KB`
  });

  try {
    const uploadPromise = (async () => {
      const storageRef = ref(storage, storagePath);
      console.log(`[Storage] 🚀 Conectando con Firebase Storage para subida en: ${storagePath}`);
      const snapshot = await uploadBytes(storageRef, blob, {
        contentType: 'image/jpeg',
        customMetadata: {
          restaurantId: cleanRestId,
          menuItemId,
          uploadedAt: new Date().toISOString()
        }
      });
      console.log(`[Storage] ✅ uploadBytes completado con éxito. Obteniendo URL de descarga...`);
      const downloadUrl = await getDownloadURL(snapshot.ref);
      console.log(`[Storage] 🔗 URL de descarga obtenida:`, downloadUrl);
      return downloadUrl;
    })();

    // Timeout de 20 segundos para redes de restaurante
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Storage upload timeout (20s exceeded)')), 20000)
    );

    return await Promise.race([uploadPromise, timeoutPromise]) as string;
  } catch (storageError: any) {
    console.error(`[Storage] ❌ Error detallado al subir foto de plato a Firebase Storage:`, {
      errorCode: storageError?.code || 'DESCONOCIDO',
      errorMessage: storageError?.message || String(storageError),
      storagePath,
      restaurantId: cleanRestId,
      menuItemId,
      errorFull: storageError
    });

    if (storageError?.code === 'storage/unauthorized') {
      console.warn(`[Storage] 🔒 Motivo probable: Permisos insuficientes en storage.rules para la ruta '${storagePath}'.`);
    } else if (storageError?.code === 'storage/canceled') {
      console.warn(`[Storage] 🚫 La subida fue cancelada.`);
    } else if (storageError?.code === 'storage/quota-exceeded') {
      console.warn(`[Storage] ⚠️ Cuota de almacenamiento excedida.`);
    } else if (storageError?.message?.includes('timeout')) {
      console.warn(`[Storage] ⏱️ La solicitud superó el tiempo límite de red (20s).`);
    }

    throw new Error('No se pudo subir la foto, verificá tu conexión e intentá de nuevo');
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

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Storage upload timeout (20s exceeded)')), 20000)
    );

    return await Promise.race([uploadPromise, timeoutPromise]) as string;
  } catch (storageError: any) {
    console.error(`[Storage] ❌ Error detallado al subir recibo:`, storageError);
    throw new Error('No se pudo subir el comprobante, verificá tu conexión e intentá de nuevo');
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
