import axios from 'axios';
import { ref } from 'vue';

// --- ESTADO DE SESIÓN REACTIVO ---
export const sessionState = ref({
  isReady: false,    
  user: null,        
  role: null,        
  token: null,       
  companyName: null,
  authError: null
});

// --- 1. API LOCAL (Agente Python) ---
const apiLocal = axios.create({
  // Prioriza la variable de entorno, si no, usa el puerto 8002 por defecto
  baseURL: import.meta.env.VITE_API_LOCAL_URL || 'http://localhost:8002/api/v1',
  headers: { 'Content-Type': 'application/json' }
});

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

apiCloud.interceptors.request.use(config => {
  if (sessionState.value.token) {
    config.headers.Authorization = `Bearer ${sessionState.value.token}`;
  }
  return config;
});

// Interceptor de Errores (Token vencido o inválido)
apiCloud.interceptors.response.use(
  res => res.data,
  err => {
    if (err.response?.status === 401) {
      console.error("🔒 Sesión no válida o expirada");
      sessionState.value.isReady = false;
      sessionState.value.authError = "La sesión ha expirado o el token es inválido. Recarga la página desde el sistema principal.";
    }
    return Promise.reject(err);
  }
);

// --- 3. SISTEMA DE HANDSHAKE (PRODUCCIÓN + DEV) ---
export const initHandshake = () => {
  return new Promise((resolve) => {

    // A. Configurar el Listener (Funciona para Prod y Simulator.html)
    const handler = (event) => {
      const data = event.data;

      // Validamos que sea el mensaje correcto
      if (data && data.type === 'OBI_INIT') {
        console.log("🔐 Handshake recibido:", data.payload);

        sessionState.value = {
          isReady: true,
          user: data.payload.user,
          role: data.payload.role,
          token: data.payload.token,
          companyName: data.payload.company_name,
          authError: null
        };

        window.removeEventListener('message', handler);
        resolve(true);
      }
    };

    window.addEventListener('message', handler);

    // B. Notificar al padre que estamos listos
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'OBI_READY' }, '*');
    }

    // C. Lógica de Fallback para Desarrollo (Fuera de Iframe)
    if (window.self === window.top) {
      console.warn("⚠️ Modo Desarrollo: Intentando usar credenciales del .env");

      const devToken = import.meta.env.VITE_DEV_TOKEN;

      if (devToken) {
          sessionState.value = {
            isReady: true,
            user: 'dev_user@obi.com',
            role: 'admin',
            token: devToken,
            companyName: 'Dev Environment',
            authError: null
          };
          resolve(true);
          return;
      } else {
          console.warn("❌ No se encontró VITE_DEV_TOKEN en el .env");
      }
    }

    // D. Timeout de seguridad
    // Si en 5 segundos no recibimos credenciales (ni por postMessage ni por .env), mostramos error.
    setTimeout(() => {
        if (!sessionState.value.isReady) {
            sessionState.value.authError = "No se pudo establecer conexión con el sistema principal. Esperando token de autenticación...";
        }
    }, 5000);
  });
};

export { apiLocal, apiCloud };
