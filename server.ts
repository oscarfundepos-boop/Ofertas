import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Allow large payloads for base64 PDFs
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ limit: '60mb', extended: true }));

// Initialize Gemini client on server-side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export interface ProposalProfile {
  nombre: string;
  vehiculo: string;
  presupuesto: number;
  coberturasObligatorias: {
    colision: boolean;
    robo: boolean;
    asistenciaVial: boolean;
    fenomenosNaturales: boolean;
    vehiculoSustituto: boolean;
  };
  prioridades: string;
  formaPago: string;
}

export interface ProposalFile {
  name: string;
  mimeType: string;
  base64: string;
}

// Endpoint to provide the 3 sample proposals already stored in public/assets/aistudio
app.get('/api/sample-proposals', (_req, res) => {
  try {
    const assetsDir = path.join(__dirname, 'public', 'assets', 'aistudio');
    const sampleFiles = [
      {
        fileName: 'Propuesta_A_Aseguradora_Cordillera_45e2b828.pdf',
        displayName: 'Propuesta A - Aseguradora Cordillera S.A.',
      },
      {
        fileName: 'Propuesta_B_Seguros_Alborada_26bdc3b0.pdf',
        displayName: 'Propuesta B - Seguros Alborada',
      },
      {
        fileName: 'Propuesta_C_Protectora_del_Valle_422f9421.pdf',
        displayName: 'Propuesta C - Protectora del Valle',
      },
    ];

    const results = sampleFiles.map((sf) => {
      const filePath = path.join(assetsDir, sf.fileName);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const buffer = fs.readFileSync(filePath);
      return {
        name: sf.displayName,
        fileName: sf.fileName,
        mimeType: 'application/pdf',
        base64: buffer.toString('base64'),
        size: buffer.length,
      };
    }).filter(Boolean);

    res.json({
      success: true,
      files: results,
      sampleProfile: {
        nombre: 'Laura Solís Vargas',
        vehiculo: 'Toyota Corolla XEi 2022 (Particular)',
        presupuesto: 400000,
        coberturasObligatorias: {
          colision: true,
          robo: true,
          asistenciaVial: true,
          fenomenosNaturales: false,
          vehiculoSustituto: false,
        },
        prioridades: 'Busco un equilibrio de precio competitivo sin sacrificar asistencia vial en carretera y deducibles razonables.',
        formaPago: 'Mensual en cuotas',
      },
    });
  } catch (error: any) {
    console.error('Error reading sample proposals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to extract client profile from a pasted message/text or an uploaded PDF
app.post('/api/extract-client-profile', async (req, res) => {
  try {
    const { text, pdfBase64, mimeType } = req.body;

    if (!text && !pdfBase64) {
      return res.status(400).json({ error: 'Debe ingresar un texto o subir un archivo PDF del cliente.' });
    }

    const extractionPrompt = `
Eres un asistente experto para corredores de seguros de automóviles en Costa Rica ("BN Corredora de Seguros").
Tu tarea es analizar el documento o texto provisto (mensaje de WhatsApp, correo electrónico, solicitud del cliente, o PDF) y extraer estructuradamente los datos del perfil del cliente para cotizar seguro voluntario de automóvil en Costa Rica.

REGLAS DE EXTRACCIÓN:
1. "nombre": Nombre completo del cliente si aparece. Si no se indica, escribe "Cliente particular".
2. "vehiculo": Marca, modelo, año y uso declarado (ej: "Toyota RAV4 2023 · Particular"). Si no aparece, pon "Vehículo no especificado".
3. "presupuesto": Presupuesto máximo anual en colones costarricenses (número entero sin decimales). Si el texto indica un monto mensual (ej: "35 mil al mes"), multiplícalo por 12. Si viene en dólares, puedes convertirlo a colones aproximados o buscar el monto en colones. Si no se indica ningún presupuesto, utiliza 400000 por defecto.
4. "coberturasObligatorias": Determina según lo que solicita o necesita el cliente:
   - colision: boolean (true si solicita cobertura completa, todo riesgo, colisión, vuelco, o daños propios).
   - robo: boolean (true si solicita cobertura de robo total o parcial).
   - asistenciaVial: boolean (true si solicita grúa, auxilio vial, asistencia 24/7 o asistencia en carretera).
   - fenomenosNaturales: boolean (true si menciona inundaciones, deslizamientos, rayería, árboles o eventos de la naturaleza).
   - vehiculoSustituto: boolean (true si pide carro sustituto o vehículo de reemplazo mientras se repara).
5. "prioridades": Síntesis en 1 o 2 oraciones de qué le interesa más al cliente (ej: "Prioriza deducibles bajos y grúa con cobertura nacional", o "Busca la opción más económica posible que cubra asistencia vial").
6. "formaPago": Selecciona la opción más acorde entre: "Mensual en cuotas", "Anual de contado", "Semestral en 2 cuotas", "Trimestral". (Por defecto: "Mensual en cuotas").
`;

    const contentParts: any[] = [];

    if (pdfBase64) {
      contentParts.push({
        inlineData: {
          mimeType: mimeType || 'application/pdf',
          data: pdfBase64,
        },
      });
    }

    if (text) {
      contentParts.push({
        text: `TEXTO / MENSAJE DEL CLIENTE A ANALIZAR:\n"""\n${text}\n"""`,
      });
    }

    contentParts.push({
      text: extractionPrompt,
    });

    const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    let lastErr: any = null;
    let geminiResponse: any = null;

    for (const modelName of modelsToTry) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`Extracting client profile with ${modelName} (attempt ${attempt})...`);
          geminiResponse = await ai.models.generateContent({
            model: modelName,
            contents: contentParts,
            config: {
              temperature: 0.1,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  nombre: { type: Type.STRING },
                  vehiculo: { type: Type.STRING },
                  presupuesto: { type: Type.NUMBER },
                  coberturasObligatorias: {
                    type: Type.OBJECT,
                    properties: {
                      colision: { type: Type.BOOLEAN },
                      robo: { type: Type.BOOLEAN },
                      asistenciaVial: { type: Type.BOOLEAN },
                      fenomenosNaturales: { type: Type.BOOLEAN },
                      vehiculoSustituto: { type: Type.BOOLEAN },
                    },
                    required: ['colision', 'robo', 'asistenciaVial', 'fenomenosNaturales', 'vehiculoSustituto'],
                  },
                  prioridades: { type: Type.STRING },
                  formaPago: { type: Type.STRING },
                },
                required: ['nombre', 'vehiculo', 'presupuesto', 'coberturasObligatorias', 'prioridades', 'formaPago'],
              },
            },
          });
          if (geminiResponse) break;
        } catch (err: any) {
          lastErr = err;
          console.warn(`Extraction attempt with ${modelName} failed:`, err?.message || err);
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
      if (geminiResponse) break;
    }

    if (!geminiResponse) {
      throw lastErr || new Error('No se pudo procesar la extracción con el modelo de IA.');
    }

    const parsed = JSON.parse(geminiResponse.text || '{}');
    return res.json({
      success: true,
      profile: parsed,
    });
  } catch (error: any) {
    console.error('Error extracting client profile:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Error al extraer los datos del perfil del cliente.',
    });
  }
});

// Endpoint to compare proposals with Gemini
app.post('/api/compare', async (req, res) => {
  try {
    const { files, profile }: { files: ProposalFile[]; profile: ProposalProfile } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'Debe proporcionar al menos 1 archivo PDF (máximo 3).' });
    }

    if (files.length > 3) {
      return res.status(400).json({ error: 'Solo se permite comparar un máximo de 3 propuestas.' });
    }

    // Build the prompt for Gemini strictly respecting the business rules
    const promptInstructions = `
Eres un actuario y analista senior de seguros en Costa Rica para "BN Corredora de Seguros".
Tienes la tarea de analizar rigurosamente ${files.length} archivo(s) PDF de propuestas de seguro voluntario de automóvil para el siguiente cliente:

DATOS DEL CLIENTE:
- Nombre: ${profile.nombre || 'No indicado'}
- Vehículo y uso: ${profile.vehiculo || 'No indicado'}
- Presupuesto máximo anual: ₡ ${Number(profile.presupuesto || 0).toLocaleString('es-CR')} colones
- Coberturas obligatorias marcadas por el cliente:
  * Colisión y vuelco: ${profile.coberturasObligatorias?.colision ? 'SÍ (OBLIGATORIA)' : 'NO'}
  * Robo total/parcial: ${profile.coberturasObligatorias?.robo ? 'SÍ (OBLIGATORIA)' : 'NO'}
  * Asistencia vial 24/7: ${profile.coberturasObligatorias?.asistenciaVial ? 'SÍ (OBLIGATORIA)' : 'NO'}
  * Fenómenos naturales: ${profile.coberturasObligatorias?.fenomenosNaturales ? 'SÍ (OBLIGATORIA)' : 'NO'}
  * Vehículo sustituto: ${profile.coberturasObligatorias?.vehiculoSustituto ? 'SÍ (OBLIGATORIA)' : 'NO'}
- Prioridades del cliente: "${profile.prioridades || 'No indicadas'}"
- Forma de pago preferida: "${profile.formaPago || 'No indicada'}"

INSTRUCCIONES Y REGLAS DE NEGOCIO ESTRICTAS:
1. Extraer de cada PDF SOLO lo que dice el documento; si un dato no aparece, escribir exactamente "no indicado". ¡NO INVENTES NINGÚN DATO!
2. VALIDACIÓN DE CAMPOS:
   - "CABE EN PRESUPUESTO": Responde "Sí" únicamente si la prima anual total (incluyendo IVA si viene indicado) es menor o igual al presupuesto máximo anual (₡ ${Number(profile.presupuesto || 0).toLocaleString('es-CR')}). Si excede el presupuesto, responde "No".
   - "CUMPLE OBLIGATORIAS": Responde "Sí" SOLO si TODAS las coberturas que el cliente marcó como obligatorias están INCLUIDAS en la prima básica del documento.
     ¡ATENCIÓN CRÍTICA!: Si una cobertura requerida se ofrece como paquete opcional con costo adicional (por ejemplo "Asistencia Plus por ₡45.000 adicionales al año que no está incluido en la prima indicada"), NO CUENTA como incluida, por lo que NO cumple obligatorias.
   - "SEMÁFORO":
     * "verde": si cabe en presupuesto ("Sí") Y cumple obligatorias ("Sí").
     * "amarillo": si cumple obligatorias ("Sí") pero NO cabe en presupuesto ("No").
     * "rojo": si NO cumple las coberturas obligatorias ("No"), sin importar su prima.
3. FILAS COMPARATIVAS EXACTAS POR CADA ASEGURADORA:
   - aseguradora: Nombre de la compañía aseguradora detectada en el PDF.
   - primaAnual: Monto exacto en colones con IVA (ej: "₡ 395.000 al año (IVA incluido)") y detalle de cuotas si aparece.
   - primaAnualNumerica: El valor numérico de la prima anual para comparaciones (ej: 395000).
   - cabeEnPresupuesto: "Sí" o "No".
   - deducibleColision: Condición exacta (ej: "10% del reclamo, mín. ₡ 150.000").
   - deducibleRobo: Condición exacta (ej: "10% del valor asegurado").
   - rcDanosTerceros: Monto/límite de RC por daños a bienes de terceros (ej: "₡ 50.000.000").
   - rcLesiones: Monto/límite de RC por lesiones o muerte a terceros (ej: "₡ 100.000.000").
   - asistenciaVial: Si está incluida 24/7 y qué cubre exactamente. Si es opcional con costo extra, aclarar "Opcional con costo adicional (no incluida)".
   - grua: Detalle de kilometraje y eventos (ej: "Hasta 50 km por evento, máx. 3 al año").
   - vehiculoSustituto: "No incluido" o detalle exacto si viene cubierto (ej: "Hasta 10 días por evento").
   - fenomenosNaturales: Si cubre inundación/deslizamiento o si dice "No aplica / No cubierto".
   - roturaCristales: Límite o condición (ej: "₡ 300.000 por evento" o "Sin límite, 1 evento al año").
   - exclusionesDestacadas: Resumen fiel de las 2-4 exclusiones principales señaladas en el documento.
   - cumpleObligatorias: "Sí" o "No".
   - semaforo: "verde", "amarillo", o "rojo".
   - justificacionSemaforo: 1 o 2 líneas explicando por qué se le asignó ese color según las reglas.

4. RECOMENDACIÓN PRELIMINAR (BORRADOR):
   - Recomienda UNA SOLA propuesta.
   - Justificada en MÁXIMO 5 LÍNEAS con los montos exactos, según las prioridades del cliente.
   - Si una propuesta amarilla (que cumple pero excede el presupuesto) resulta ser la mejor para sus prioridades y protección integral, debes indicarlo claramente y cuantificar con exactitud la diferencia de prima respecto al presupuesto o a las otras opciones.

5. MENSAJE SUGERIDO PARA EL CLIENTE (WHATSAPP):
   - Formato para WhatsApp (emojis profesionales sobrios, negritas con asteriscos).
   - MÁXIMO 8 LÍNEAS.
   - Tono cordial, empático y sin tecnicismos bancarios o de reaseguro.
   - Debe contener:
     1. Saludo cordial y recomendación directa.
     2. Dos razones clave que justifican esa elección según sus necesidades.
     3. La alternativa disponible (por si desea comparar costo vs cobertura).
     4. Un próximo paso concreto (ej: "¿Te parece si revisamos los deducibles para emitir?").
     5. ¡IMPORTANTE!: NUNCA prometas plazos de tiempo ("en 2 horas", "mañana te lo tengo listo").

Entrega la respuesta en formato JSON estructurado conforme al schema requerido.
`;

    // Prepare inline data parts for each PDF
    const contentParts: any[] = files.map((file, idx) => ({
      inlineData: {
        mimeType: file.mimeType || 'application/pdf',
        data: file.base64,
      },
    }));

    contentParts.push({
      text: promptInstructions,
    });

    // Call Gemini with retry logic for resilience against temporary 503 high demand spikes
    const callGeminiWithRetry = async () => {
      const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
      let lastErr: any = null;

      for (const modelName of modelsToTry) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(`Calling model ${modelName} (attempt ${attempt})...`);
            const response = await ai.models.generateContent({
              model: modelName,
              contents: contentParts,
              config: {
                temperature: 0.1,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    aseguradoras: {
                      type: Type.ARRAY,
                      description: 'Lista de propuestas analizadas, una por cada PDF provisto',
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          nombreArchivo: { type: Type.STRING },
                          aseguradora: { type: Type.STRING },
                          primaAnual: { type: Type.STRING },
                          primaAnualNumerica: { type: Type.NUMBER },
                          cabeEnPresupuesto: { type: Type.STRING, description: '"Sí" o "No"' },
                          deducibleColision: { type: Type.STRING },
                          deducibleRobo: { type: Type.STRING },
                          rcDanosTerceros: { type: Type.STRING },
                          rcLesiones: { type: Type.STRING },
                          asistenciaVial: { type: Type.STRING },
                          grua: { type: Type.STRING },
                          vehiculoSustituto: { type: Type.STRING },
                          fenomenosNaturales: { type: Type.STRING },
                          roturaCristales: { type: Type.STRING },
                          exclusionesDestacadas: { type: Type.STRING },
                          cumpleObligatorias: { type: Type.STRING, description: '"Sí" o "No"' },
                          semaforo: { type: Type.STRING, description: '"verde", "amarillo" o "rojo"' },
                          justificacionSemaforo: { type: Type.STRING },
                        },
                        required: [
                          'aseguradora',
                          'primaAnual',
                          'cabeEnPresupuesto',
                          'deducibleColision',
                          'deducibleRobo',
                          'rcDanosTerceros',
                          'rcLesiones',
                          'asistenciaVial',
                          'grua',
                          'vehiculoSustituto',
                          'fenomenosNaturales',
                          'roturaCristales',
                          'exclusionesDestacadas',
                          'cumpleObligatorias',
                          'semaforo',
                        ],
                      },
                    },
                    recomendacionPreliminar: {
                      type: Type.STRING,
                      description: 'Recomendación preliminar justificada en máximo 5 líneas con montos',
                    },
                    mensajeWhatsApp: {
                      type: Type.STRING,
                      description: 'Mensaje para el cliente en WhatsApp de máximo 8 líneas en tono cordial',
                    },
                  },
                  required: ['aseguradoras', 'recomendacionPreliminar', 'mensajeWhatsApp'],
                },
              },
            });
            return response;
          } catch (err: any) {
            lastErr = err;
            console.warn(`Attempt ${attempt} with ${modelName} failed:`, err?.message || err);
            // Wait 1.5 seconds before retrying
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }
      }
      throw lastErr;
    };

    const response = await callGeminiWithRetry();

    const textOutput = response.text || '{}';
    let parsedResult;
    try {
      parsedResult = JSON.parse(textOutput);
    } catch (e) {
      console.error('Failed to parse Gemini output:', textOutput);
      return res.status(500).json({ error: 'La respuesta de la IA no pudo procesarse correctamente en JSON.' });
    }

    // Attach original file names if missing
    if (parsedResult.aseguradoras && Array.isArray(parsedResult.aseguradoras)) {
      parsedResult.aseguradoras = parsedResult.aseguradoras.map((item: any, i: number) => ({
        ...item,
        nombreArchivo: item.nombreArchivo || files[i]?.name || `Propuesta ${i + 1}`,
      }));
    }

    return res.json({
      success: true,
      result: parsedResult,
    });
  } catch (error: any) {
    console.error('Error during comparison:', error);
    return res.status(500).json({
      error: error?.message || 'Ocurrió un error al procesar las propuestas.',
    });
  }
});

// In dev, attach Vite middleware. In prod, serve static dist folder.
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Comparador de Propuestas BN running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
