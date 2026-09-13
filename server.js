import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing middleware (supports large receipt image payloads)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Healthcheck endpoints (for Cloud Run and load balancers)
app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'gastro_smart_server' });
});

// API: Escaneo inteligente de tickets y recibos de compra con Gemini
app.post('/api/scan-receipt', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionó la imagen del recibo.',
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        error: 'Clave de API de Gemini no configurada en el servidor.',
      });
    }

    // Limpiar prefijo data:image/...;base64, si viene incluido
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const detectedMime = mimeType || 'image/jpeg';

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = `Actúa como un perito contable y auditor de restaurantes. Analiza meticulosamente esta imagen de un ticket, factura, boleta o recibo de compra de víveres, insumos o suministros para cocina y restaurante.
Extrae con la máxima fidelidad:
1. Proveedor: nombre comercial de la tienda, mercado mayorista, distribuidor o emisor.
2. Teléfono: teléfono de contacto del proveedor si está impreso.
3. Fecha: fecha de la transacción en formato ISO YYYY-MM-DD (si no es legible, usa la fecha de hoy).
4. Método de pago: si se indica efectivo, tarjeta, transferencia o crédito.
5. Items comprados: cada insumo adquirido con nombre claro (ej. "Pescado fresco", "Limón", "Aceite vegetal"), cantidad numérica precisa, unidad normalizada ('kg', 'litros', 'unidades' o 'cajas'), precio unitario y subtotal.
6. Total general y notas adicionales como número de comprobante o RUC/RIF/NIT si existe.`;

    const receiptSchema = {
      type: Type.OBJECT,
      properties: {
        proveedor: {
          type: Type.STRING,
          description: 'Nombre comercial del proveedor o distribuidor de víveres',
        },
        telefono: {
          type: Type.STRING,
          description: 'Teléfono o celular de contacto del proveedor si aparece',
        },
        fecha: {
          type: Type.STRING,
          description: 'Fecha de la compra en formato YYYY-MM-DD',
        },
        metodoPago: {
          type: Type.STRING,
          enum: ['efectivo', 'tarjeta', 'transferencia', 'credito'],
          description: 'Método de pago deducido del ticket',
        },
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              nombre: {
                type: Type.STRING,
                description: 'Nombre del insumo o producto (ej. Limón sutil, Pescado mero, Aceite)',
              },
              cantidad: {
                type: Type.NUMBER,
                description: 'Cantidad comprada en formato numérico',
              },
              unidad: {
                type: Type.STRING,
                enum: ['kg', 'litros', 'unidades', 'cajas'],
                description: 'Unidad de medida del insumo',
              },
              precioUnitario: {
                type: Type.NUMBER,
                description: 'Precio unitario por la unidad indicada',
              },
              subtotal: {
                type: Type.NUMBER,
                description: 'Subtotal o importe total del item',
              },
            },
            required: ['nombre', 'cantidad', 'unidad', 'precioUnitario', 'subtotal'],
          },
        },
        total: {
          type: Type.NUMBER,
          description: 'Total general de la compra en el recibo',
        },
        notas: {
          type: Type.STRING,
          description: 'Observaciones, número de comprobante, ticket o factura',
        },
      },
      required: ['items', 'total'],
    };

    const aiResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: detectedMime,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: receiptSchema,
      },
    });

    const responseText = aiResponse.text;
    if (!responseText) {
      return res.status(502).json({
        success: false,
        error: 'No se recibió respuesta estructurada del modelo de IA.',
      });
    }

    const parsedData = JSON.parse(responseText);

    return res.json({
      success: true,
      data: parsedData,
    });
  } catch (error) {
    console.error('Error al escanear recibo con Gemini:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error interno al procesar el ticket con IA.',
    });
  }
});

// Servir archivos estáticos del frontend en producción
const distPath = path.join(process.cwd(), 'dist');
app.use(express.static(distPath));

// Fallback para SPA (Single Page Application)
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Iniciar servidor escuchando en 0.0.0.0 y PORT
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Gastro Smart Server ejecutándose en http://0.0.0.0:${PORT}`);
});
