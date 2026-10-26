import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'bn_corredora_secret_session_2026_cr';

// Allow large payloads for base64 PDFs
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ limit: '60mb', extended: true }));
app.use(cookieParser(SESSION_SECRET));

// --- DATA PERSISTENCE & SCHEMAS ---
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'usuarios.json');
const COMPARISONS_FILE = path.join(DATA_DIR, 'comparaciones.json');
const AUDIT_FILE = path.join(DATA_DIR, 'auditoria.json');

export interface Usuario {
  id: string;
  usuario: string; // nombre corto, sin espacios, en minúsculas
  nombre: string;
  rol: 'administrador' | 'asesor';
  estado: 'activo' | 'suspendido';
  debeCambiarClave: boolean;
  fechaCreacion: string;
  ultimoAcceso: string;
  claveHash: string;
}

export type SafeUsuario = Omit<Usuario, 'claveHash'>;

export interface ComparacionGuardada {
  id: string;
  usuarioId: string;
  usuario: string;
  nombreCliente: string;
  vehiculo: string;
  presupuesto: number;
  cantidadPropuestas: number;
  recomendacion: string;
  mensajeWhatsApp: string;
  propuestasResumen: string;
  fechaCreacion: string;
}

export interface RegistroAuditoria {
  id: string;
  accion: string;
  userId: string;
  usuario: string;
  detalles: string;
  timestamp: string;
}

// Ensure directory and initialize data files
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial Admin creation if usuarios.json does not exist
if (!fs.existsSync(USERS_FILE)) {
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync('Fundepos2026*', salt);
  const adminInicial: Usuario = {
    id: 'usr_admin',
    usuario: 'admin',
    nombre: 'Administrador',
    rol: 'administrador',
    estado: 'activo',
    debeCambiarClave: true,
    fechaCreacion: new Date().toISOString(),
    ultimoAcceso: new Date().toISOString(),
    claveHash: hash,
  };
  fs.writeFileSync(USERS_FILE, JSON.stringify([adminInicial], null, 2), 'utf-8');
  console.log('Archivo data/usuarios.json inicializado con usuario "admin" (Fundepos2026*).');
}

if (!fs.existsSync(COMPARISONS_FILE)) {
  fs.writeFileSync(COMPARISONS_FILE, JSON.stringify([], null, 2), 'utf-8');
}

if (!fs.existsSync(AUDIT_FILE)) {
  fs.writeFileSync(AUDIT_FILE, JSON.stringify([], null, 2), 'utf-8');
}

// Helpers for data reading / writing
function leerUsuarios(): Usuario[] {
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8') || '[]');
  } catch (err) {
    console.error('Error leyendo usuarios.json:', err);
    return [];
  }
}

function guardarUsuarios(usuarios: Usuario[]): void {
  fs.writeFileSync(USERS_FILE, JSON.stringify(usuarios, null, 2), 'utf-8');
}

function getSafeUser(u: Usuario): SafeUsuario {
  const { claveHash, ...safe } = u;
  return safe;
}

function leerComparaciones(): ComparacionGuardada[] {
  try {
    if (!fs.existsSync(COMPARISONS_FILE)) return [];
    return JSON.parse(fs.readFileSync(COMPARISONS_FILE, 'utf-8') || '[]');
  } catch (err) {
    console.error('Error leyendo comparaciones.json:', err);
    return [];
  }
}

function guardarComparaciones(comparaciones: ComparacionGuardada[]): void {
  fs.writeFileSync(COMPARISONS_FILE, JSON.stringify(comparaciones, null, 2), 'utf-8');
}

function registrarAuditoria(accion: string, userId: string, usuario: string, detalles: string): void {
  try {
    const logs: RegistroAuditoria[] = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8') || '[]');
    logs.unshift({
      id: 'aud_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      accion,
      userId,
      usuario,
      detalles,
      timestamp: new Date().toISOString(),
    });
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(logs.slice(0, 1500), null, 2), 'utf-8');
  } catch (err) {
    console.error('Error guardando auditoría:', err);
  }
}

// --- SESSION MANAGEMENT (8 HOURS COOKIE) ---
interface SessionInfo {
  sessionId: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}
const sessions = new Map<string, SessionInfo>();

// Middleware: Authenticated User & Active check
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionId = req.signedCookies?.bn_session;
  if (!sessionId) {
    return res.status(401).json({ error: 'No autorizado. Debe iniciar sesión.' });
  }

  const session = sessions.get(sessionId);
  if (!session || session.expiresAt < Date.now()) {
    if (session) sessions.delete(sessionId);
    res.clearCookie('bn_session', { path: '/' });
    return res.status(401).json({ error: 'Sesión expirada. Inicie sesión nuevamente.' });
  }

  const usuarios = leerUsuarios();
  const user = usuarios.find((u) => u.id === session.userId);
  if (!user) {
    sessions.delete(sessionId);
    res.clearCookie('bn_session', { path: '/' });
    return res.status(401).json({ error: 'Usuario no encontrado.' });
  }

  if (user.estado === 'suspendido') {
    return res.status(401).json({ error: 'usuario suspendido, contacte al administrador' });
  }

  (req as any).user = user;
  next();
}

// Middleware: Admin role check
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as any).user as Usuario;
  if (user?.rol !== 'administrador') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
  }
  next();
}

// --- AUTHENTICATION ENDPOINTS ---

// POST /api/login (usuario y contraseña)
app.post('/api/login', (req, res) => {
  try {
    const { usuario, clave, password } = req.body;
    const inputClave = clave || password;

    if (!usuario || !inputClave) {
      return res.status(400).json({ error: 'Debe ingresar usuario y contraseña.' });
    }

    const cleanUser = String(usuario).trim().toLowerCase();
    const usuarios = leerUsuarios();
    const user = usuarios.find((u) => u.usuario.toLowerCase() === cleanUser);

    if (!user) {
      return res.status(401).json({ error: 'usuario o contraseña incorrectos' });
    }

    const claveValida = bcrypt.compareSync(String(inputClave), user.claveHash);
    if (!claveValida) {
      return res.status(401).json({ error: 'usuario o contraseña incorrectos' });
    }

    if (user.estado === 'suspendido') {
      return res.status(403).json({ error: 'usuario suspendido, contacte al administrador' });
    }

    // Create session (8 hours = 28,800,000 ms)
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
    sessions.set(sessionId, {
      sessionId,
      userId: user.id,
      createdAt: Date.now(),
      expiresAt,
    });

    user.ultimoAcceso = new Date().toISOString();
    guardarUsuarios(usuarios);

    registrarAuditoria('LOGIN', user.id, user.usuario, 'Inicio de sesión exitoso');

    res.cookie('bn_session', sessionId, {
      httpOnly: true,
      signed: true,
      maxAge: 8 * 60 * 60 * 1000,
      sameSite: 'lax',
      path: '/',
    });

    return res.json({
      success: true,
      user: getSafeUser(user),
    });
  } catch (err: any) {
    console.error('Error en /api/login:', err);
    return res.status(500).json({ error: 'Error interno al procesar el inicio de sesión.' });
  }
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  const sessionId = req.signedCookies?.bn_session;
  if (sessionId && sessions.has(sessionId)) {
    const s = sessions.get(sessionId);
    if (s) {
      const usuarios = leerUsuarios();
      const u = usuarios.find((x) => x.id === s.userId);
      if (u) {
        registrarAuditoria('LOGOUT', u.id, u.usuario, 'Cierre de sesión');
      }
    }
    sessions.delete(sessionId);
  }
  res.clearCookie('bn_session', { path: '/' });
  return res.json({ success: true, message: 'Sesión cerrada exitosamente.' });
});

// GET /api/yo (devuelve el usuario conectado)
app.get('/api/yo', requireAuth, (req, res) => {
  const user = (req as any).user as Usuario;
  return res.json({
    success: true,
    user: getSafeUser(user),
  });
});

// POST /api/cambiar-clave (mínimo 8 caracteres, al menos un número)
app.post('/api/cambiar-clave', requireAuth, (req, res) => {
  try {
    const user = (req as any).user as Usuario;
    const { claveNueva } = req.body;

    if (!claveNueva || typeof claveNueva !== 'string') {
      return res.status(400).json({ error: 'Debe ingresar una nueva contraseña.' });
    }

    // Regla: mínimo 8 caracteres, al menos un número
    const regexClave = /^(?=.*\d).{8,}$/;
    if (!regexClave.test(claveNueva)) {
      return res.status(400).json({
        error: 'La nueva contraseña debe tener un mínimo de 8 caracteres y contener al menos un número.',
      });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(claveNueva, salt);

    const usuarios = leerUsuarios();
    const idx = usuarios.findIndex((u) => u.id === user.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    usuarios[idx].claveHash = hash;
    usuarios[idx].debeCambiarClave = false;
    usuarios[idx].ultimoAcceso = new Date().toISOString();
    guardarUsuarios(usuarios);

    registrarAuditoria('CAMBIO_CLAVE', user.id, user.usuario, 'Contraseña cambiada exitosamente');

    return res.json({
      success: true,
      message: 'Contraseña actualizada correctamente.',
      user: getSafeUser(usuarios[idx]),
    });
  } catch (err: any) {
    console.error('Error en /api/cambiar-clave:', err);
    return res.status(500).json({ error: 'Error al cambiar la contraseña.' });
  }
});

// --- USER MANAGEMENT (ADMIN ONLY) ---
// GET /api/usuarios
app.get('/api/usuarios', requireAuth, requireAdmin, (_req, res) => {
  const usuarios = leerUsuarios();
  return res.json({
    success: true,
    usuarios: usuarios.map(getSafeUser),
  });
});

// POST /api/usuarios (Crear usuario nuevo)
app.post('/api/usuarios', requireAuth, requireAdmin, (req, res) => {
  try {
    const adminUser = (req as any).user as Usuario;
    const { usuario, nombre, rol, clave } = req.body;

    if (!usuario || !nombre || !rol) {
      return res.status(400).json({ error: 'Todos los campos son requeridos (usuario, nombre, rol).' });
    }

    // usuario: nombre corto, sin espacios, en minúsculas
    const cleanUser = String(usuario).trim().toLowerCase().replace(/\s+/g, '');
    if (!/^[a-z0-9._-]+$/.test(cleanUser)) {
      return res.status(400).json({ error: 'El nombre de usuario debe ser en minúsculas, sin espacios (solo letras, números, punto o guión).' });
    }

    const usuarios = leerUsuarios();
    if (usuarios.some((u) => u.usuario.toLowerCase() === cleanUser)) {
      return res.status(400).json({ error: 'El nombre de usuario ya está en uso.' });
    }

    const claveInicial = clave || 'Fundepos2026*';
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(claveInicial, salt);

    const nuevoUsuario: Usuario = {
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      usuario: cleanUser,
      nombre: String(nombre).trim(),
      rol: rol === 'administrador' ? 'administrador' : 'asesor',
      estado: 'activo',
      debeCambiarClave: true,
      fechaCreacion: new Date().toISOString(),
      ultimoAcceso: 'Nunca',
      claveHash: hash,
    };

    usuarios.push(nuevoUsuario);
    guardarUsuarios(usuarios);

    registrarAuditoria('CREAR_USUARIO', adminUser.id, adminUser.usuario, `Creó usuario ${cleanUser} con rol ${nuevoUsuario.rol}`);

    return res.json({
      success: true,
      usuario: getSafeUser(nuevoUsuario),
    });
  } catch (err: any) {
    console.error('Error creando usuario:', err);
    return res.status(500).json({ error: 'Error al registrar el nuevo usuario.' });
  }
});

// PATCH /api/usuarios/:id (Cambiar rol o estado)
app.patch('/api/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const adminUser = (req as any).user as Usuario;
    const { id } = req.params;
    const { rol, estado, resetearClave } = req.body;

    const usuarios = leerUsuarios();
    const idx = usuarios.findIndex((u) => u.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // Proteger al admin principal
    if (usuarios[idx].usuario === 'admin' && estado === 'suspendido') {
      return res.status(400).json({ error: 'No es posible suspender al administrador principal.' });
    }

    if (rol && (rol === 'administrador' || rol === 'asesor')) {
      usuarios[idx].rol = rol;
    }

    if (estado && (estado === 'activo' || estado === 'suspendido')) {
      usuarios[idx].estado = estado;
    }

    if (resetearClave) {
      const salt = bcrypt.genSaltSync(10);
      usuarios[idx].claveHash = bcrypt.hashSync('Fundepos2026*', salt);
      usuarios[idx].debeCambiarClave = true;
    }

    guardarUsuarios(usuarios);
    registrarAuditoria('MODIFICAR_USUARIO', adminUser.id, adminUser.usuario, `Modificó al usuario ${usuarios[idx].usuario}`);

    return res.json({
      success: true,
      usuario: getSafeUser(usuarios[idx]),
    });
  } catch (err: any) {
    console.error('Error actualizando usuario:', err);
    return res.status(500).json({ error: 'Error al actualizar el usuario.' });
  }
});

// --- SAVED COMPARISONS & AUDIT ENDPOINTS (FILE BASED) ---

// POST /api/comparaciones (Guardar comparación)
app.post('/api/comparaciones', requireAuth, (req, res) => {
  try {
    const user = (req as any).user as Usuario;
    const { nombreCliente, vehiculo, presupuesto, cantidadPropuestas, recomendacion, mensajeWhatsApp, propuestasResumen } = req.body;

    const nuevaComp: ComparacionGuardada = {
      id: 'comp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      usuarioId: user.id,
      usuario: user.usuario,
      nombreCliente: nombreCliente || 'Cliente particular',
      vehiculo: vehiculo || 'Vehículo particular',
      presupuesto: Number(presupuesto) || 0,
      cantidadPropuestas: Number(cantidadPropuestas) || 0,
      recomendacion: recomendacion || '',
      mensajeWhatsApp: mensajeWhatsApp || '',
      propuestasResumen: typeof propuestasResumen === 'string' ? propuestasResumen : JSON.stringify(propuestasResumen || []),
      fechaCreacion: new Date().toISOString(),
    };

    const comparaciones = leerComparaciones();
    comparaciones.unshift(nuevaComp);
    guardarComparaciones(comparaciones);

    registrarAuditoria(
      'COMPARACION_GUARDADA',
      user.id,
      user.usuario,
      `Guardó comparativa para cliente "${nuevaComp.nombreCliente}" con ${nuevaComp.cantidadPropuestas} propuestas`
    );

    return res.json({ success: true, comparacion: nuevaComp });
  } catch (err: any) {
    console.error('Error guardando comparación:', err);
    return res.status(500).json({ error: 'Error al guardar la comparación.' });
  }
});

// GET /api/comparaciones (Listar comparaciones)
app.get('/api/comparaciones', requireAuth, (req, res) => {
  const user = (req as any).user as Usuario;
  const comparaciones = leerComparaciones();

  if (user.rol === 'administrador') {
    return res.json({ success: true, comparaciones });
  } else {
    const userComps = comparaciones.filter((c) => c.usuarioId === user.id);
    return res.json({ success: true, comparaciones: userComps });
  }
});

// DELETE /api/comparaciones/:id
app.delete('/api/comparaciones/:id', requireAuth, (req, res) => {
  try {
    const user = (req as any).user as Usuario;
    const { id } = req.params;

    const comparaciones = leerComparaciones();
    const comp = comparaciones.find((c) => c.id === id);
    if (!comp) {
      return res.status(404).json({ error: 'Comparación no encontrada.' });
    }

    if (comp.usuarioId !== user.id && user.rol !== 'administrador') {
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta comparación.' });
    }

    const filtradas = comparaciones.filter((c) => c.id !== id);
    guardarComparaciones(filtradas);

    registrarAuditoria('COMPARACION_ELIMINADA', user.id, user.usuario, `Eliminó la comparación ${id}`);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error eliminando comparación:', err);
    return res.status(500).json({ error: 'Error al eliminar la comparación.' });
  }
});

// GET /api/auditoria (Listar auditoría - admin)
app.get('/api/auditoria', requireAuth, requireAdmin, (_req, res) => {
  try {
    const logs: RegistroAuditoria[] = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8') || '[]');
    return res.json({ success: true, logs });
  } catch (err) {
    return res.json({ success: true, logs: [] });
  }
});

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

// Endpoint to provide the 3 sample proposals (PROTECTED WITH REQUIREAUTH)
app.get('/api/sample-proposals', requireAuth, (_req, res) => {
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

// Endpoint to extract client profile from text/pdf (PROTECTED WITH REQUIREAUTH)
app.post('/api/extract-client-profile', requireAuth, async (req, res) => {
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

// Endpoint to compare proposals with Gemini (PROTECTED WITH REQUIREAUTH)
app.post('/api/compare', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user as Usuario;
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
    const contentParts: any[] = files.map((file) => ({
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

    registrarAuditoria(
      'COMPARACION_EJECUTADA',
      user.id,
      user.usuario,
      `Ejecutó comparación para cliente "${profile.nombre}" (${files.length} cotizaciones)`
    );

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
