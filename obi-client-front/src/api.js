// src/api.js
import axios from 'axios';
import { ref } from 'vue';

// --- ESTADO DE SESIÓN REACTIVO ---
// Usamos 'ref' para que si cambia el estado, la UI reaccione (ej: quitar loading)
export const sessionState = ref({
  isReady: false,    // ¿Ya recibimos el token?
  user: null,        // Email o ID del usuario
  role: null,        // Rol para RBAC local
  token: null,       // Token Sanctum para Laravel
  companyName: null  // Opcional: Para mostrar en UI
});

// --- 1. API LOCAL (Agente Python) ---
const apiLocal = axios.create({
  baseURL: import.meta.env.VITE_API_LOCAL_URL || 'http://localhost:8001/api/v1',
  headers: { 'Content-Type': 'application/json' }
});

// Interceptor Local: Inyecta el usuario/rol para el RBAC interno
apiLocal.interceptors.request.use(config => {
  if (sessionState.value.user) {
    config.params = config.params || {};
    config.params['current_user'] = sessionState.value.user;
    config.params['current_role'] = sessionState.value.role;
  }
  return config;
});

apiLocal.interceptors.response.use(
  res => res.data && res.data.data ? res.data.data : res.data,
  err => Promise.reject(err)
);

// --- 2. API CLOUD (Laravel) ---
const apiCloud = axios.create({
  baseURL: import.meta.env.VITE_API_CLOUD_URL || 'http://127.0.0.1:8000/api',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Interceptor Cloud: Inyecta el Bearer Token
apiCloud.interceptors.request.use(config => {
  if (sessionState.value.token) {
    config.headers.Authorization = `Bearer ${sessionState.value.token}`;
  }
  return config;
});

// Manejo de errores Cloud (401, 429 plans, etc)
apiCloud.interceptors.response.use(
  res => res.data,
  err => {
    if (err.response?.status === 401) {
      console.error("🔒 Token Laravel inválido o expirado");
      sessionState.value.isReady = false; // Bloquear UI
    }
    return Promise.reject(err);
  }
);

// --- 3. SISTEMA DE HANDSHAKE (PostMessage) ---
export const initHandshake = () => {
  return new Promise((resolve) => {
    // A. Si estamos en desarrollo (fuera de iframe), usar credenciales dummy
    if (window.self === window.top) {
      console.warn("⚠️ Modo Desarrollo detectado (No Iframe). Usando credenciales prueba.");
      sessionState.value = {
        isReady: true,
        user: 'dev_user@obi.com',
        role: 'admin',
        token: 'DUMMY_TOKEN_DEV', // Aquí pondrás un token real tuyo si quieres probar con Laravel local
        companyName: 'Dev Company'
      };
      resolve(true);
      return;
    }

    // B. Modo Producción: Escuchar mensaje del Padre
    const handler = (event) => {
      // IMPORTANTE: En producción, valida event.origin aquí por seguridad
      // if (event.origin !== "https://tudominio.com") return;

      const data = event.data;
      if (data && data.type === 'OBI_INIT') {
        console.log("🔐 Handshake recibido del Host:", data.payload);
        sessionState.value = {
          isReady: true,
          user: data.payload.user,
          role: data.payload.role,
          token: data.payload.token,
          companyName: data.payload.company_name
        };
        window.removeEventListener('message', handler);
        resolve(true);
      }
    };

    window.addEventListener('message', handler);

    // Opcional: Enviar mensaje "I am ready" al padre
    window.parent.postMessage({ type: 'OBI_READY' }, '*');
  });
};

export { apiLocal, apiCloud };
