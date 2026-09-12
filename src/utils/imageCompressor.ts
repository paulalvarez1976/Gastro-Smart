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
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
}

export function compressImage(
  file: File,
  maxWidth = 800,
  quality = 0.8
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    // Validar tipo de archivo
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      reject(new Error('Formato no soportado. Por favor selecciona una imagen JPG, PNG o WEBP.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Redimensionar si supera el ancho máximo (800px)
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

        // Fondo blanco por si el PNG tiene transparencia
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        // Dibujar imagen redimensionada
        ctx.drawImage(img, 0, 0, width, height);

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
              width,
              height,
              originalSize: file.size,
              compressedSize: blob.size
            });
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => {
        reject(new Error('No se pudo leer la imagen seleccionada.'));
      };

      img.src = readerEvent.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Error al leer el archivo desde el dispositivo.'));
    };

    reader.readAsDataURL(file);
  });
}
