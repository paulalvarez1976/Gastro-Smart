import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // CORS configuration allowing Capacitor (iOS/Android) and Web origins
  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));

  // Soportar payloads de imágenes escaneadas en base64 de alta resolución
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // API Healthcheck
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "gastro_smart_server" });
  });

  // API: Escaneo inteligente de tickets y recibos de compra con Gemini 3.8 Flash
  app.post("/api/scan-receipt", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ 
          success: false, 
          error: "No se proporcionó la imagen del recibo." 
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          success: false,
          error: "Clave de API de Gemini no configurada en el servidor."
        });
      }

      // Limpiar prefijo data:image/...;base64, si viene incluido
      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");
      const detectedMime = mimeType || "image/jpeg";

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
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
            description: "Nombre comercial del proveedor o distribuidor de víveres",
          },
          telefono: {
            type: Type.STRING,
            description: "Teléfono o celular de contacto del proveedor si aparece",
          },
          fecha: {
            type: Type.STRING,
            description: "Fecha de la compra en formato YYYY-MM-DD",
          },
          metodoPago: {
            type: Type.STRING,
            enum: ["efectivo", "tarjeta", "transferencia", "credito"],
            description: "Método de pago deducido del ticket",
          },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                nombre: {
                  type: Type.STRING,
                  description: "Nombre del insumo o producto (ej. Limón sutil, Pescado mero, Aceite)",
                },
                cantidad: {
                  type: Type.NUMBER,
                  description: "Cantidad comprada en formato numérico",
                },
                unidad: {
                  type: Type.STRING,
                  enum: ["kg", "litros", "unidades", "cajas"],
                  description: "Unidad de medida del insumo",
                },
                precioUnitario: {
                  type: Type.NUMBER,
                  description: "Precio unitario por la unidad indicada",
                },
                subtotal: {
                  type: Type.NUMBER,
                  description: "Subtotal o importe total del item",
                },
              },
              required: ["nombre", "cantidad", "unidad", "precioUnitario", "subtotal"],
            },
          },
          total: {
            type: Type.NUMBER,
            description: "Total general de la compra en el recibo",
          },
          notas: {
            type: Type.STRING,
            description: "Observaciones, número de comprobante, ticket o factura",
          },
        },
        required: ["items", "total"],
      };

      const aiResponse = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: [
          {
            role: "user",
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
          responseMimeType: "application/json",
          responseSchema: receiptSchema,
        },
      });

      const responseText = aiResponse.text;
      if (!responseText) {
        return res.status(502).json({
          success: false,
          error: "No se recibió respuesta estructurada del modelo de IA.",
        });
      }

      const parsedData = JSON.parse(responseText);

      return res.json({
        success: true,
        data: parsedData,
      });
    } catch (error: any) {
      console.error("Error al escanear recibo con Gemini:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Error interno al procesar el ticket con IA.",
      });
    }
  });

  // Configuración de Vite como Middleware en Desarrollo o Archivos Estáticos en Producción
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Gastro Smart Server ejecutándose en http://0.0.0.0:${PORT}`);
  });
}

startServer();
