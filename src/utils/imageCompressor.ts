/**
 * Utilidad para comprimir y redimensionar imágenes antes de subirlas.
 * - Ancho máximo: 800px (mantiene relación de aspecto)
 * - Calidad JPEG: 80% (0.8)
 * - Acepta JPG, PNG, WEBP
 * - Ligera para carga ultrarrápida en tablets y TPVs
 */

export interface CompressionResult {
  blob: Blob;
  previewUrl: string;
  dataUrl: string;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
}

export function compressImage(
  file: File | Blob,
  maxWidth = 800,
  quality = 0.8
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    // Validar tipo de archivo si existe
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
    const fileType = file.type ? file.type.toLowerCase() : 'image/jpeg';
    if (file.type && !validTypes.includes(fileType)) {
      reject(new Error('Formato no soportado. Por favor selecciona una imagen JPG, PNG o WEBP.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Redimensionar si supera el ancho máximo
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo inicializar el contexto de dibujo canvas.'));
          return;
        }

        // Fondo blanco por si el PNG o WEBP tiene transparencia
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        // Dibujar imagen redimensionada
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Error al generar el archivo comprimido.'));
              return;
            }

            const previewUrl = URL.createObjectURL(blob);
            resolve({
              blob,
              previewUrl,
              dataUrl,
              width,
              height,
              originalSize: file.size || blob.size,
              compressedSize: blob.size
            });
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => {
        reject(new Error('No se pudo procesar la imagen seleccionada.'));
      };

      img.src = readerEvent.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Error al leer el archivo desde el dispositivo.'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Optimiza específicamente logotipos de restaurantes:
 * - Soporta preservación de transparencias (PNG/WEBP)
 * - Tamaño máximo balanceado (400px) para máxima nitidez y peso ultra-bajo (< 80KB)
 */
export function compressLogo(
  file: File | Blob,
  maxDimension = 400
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'];
    const fileType = file.type ? file.type.toLowerCase() : 'image/png';
    if (file.type && !validTypes.includes(fileType)) {
      reject(new Error('Formato no soportado. Por favor selecciona una imagen PNG, JPG, WEBP o SVG.'));
      return;
    }

    const isTransparent = fileType.includes('png') || fileType.includes('webp') || fileType.includes('svg');
    const outputFormat = isTransparent ? 'image/png' : 'image/jpeg';
    const outputQuality = isTransparent ? undefined : 0.85;

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Mantener proporción limitando la dimensión máxima
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo inicializar el contexto de canvas.'));
          return;
        }

        if (!isTransparent) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL(outputFormat, outputQuality);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Error al procesar el logo del restaurante.'));
              return;
            }

            const previewUrl = URL.createObjectURL(blob);
            resolve({
              blob,
              previewUrl,
              dataUrl,
              width,
              height,
              originalSize: file.size || blob.size,
              compressedSize: blob.size
            });
          },
          outputFormat,
          outputQuality
        );
      };

      img.onerror = () => {
        reject(new Error('No se pudo procesar la imagen del logotipo.'));
      };

      img.src = readerEvent.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Error al leer el archivo de logotipo.'));
    };

    reader.readAsDataURL(file);
  });
}

