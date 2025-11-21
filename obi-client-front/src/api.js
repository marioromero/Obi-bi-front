// src/api.js
import axios from 'axios';

// 1. Variables internas para guardar el contexto (Usuario/Rol)
let contextUser = null;
let contextRole = null;

// Función para configurar el contexto desde App.vue
export const setApiContext = (user, role) => {
    contextUser = user;
    contextRole = role;
    console.log("🔒 Contexto de seguridad establecido:", { user, role });
};

// 2. Configuración base de Axios
const api = axios.create({
    baseURL: 'http://localhost:8002/api/v1', // Asegúrate que tu Python corre aquí
    headers: {
        'Content-Type': 'application/json'
    }
});

// 3. Interceptor de Solicitud (Request)
// Antes de salir, pega el usuario y rol a los parámetros
api.interceptors.request.use(config => {
    // Si es GET, usa params. Si es POST, depende de tu backend,
    // pero asumiremos query params para autenticación por ahora según tu diseño.
    config.params = config.params || {};

    if (contextUser) config.params['current_user'] = contextUser;
    if (contextRole) config.params['current_role'] = contextRole;

    return config;
});

// 4. Interceptor de Respuesta (Response)
// Desempaqueta la respuesta { status: true, data: ... }
api.interceptors.response.use(
    response => {
        const res = response.data;
        // Si tu backend devuelve siempre { data: ... }, retornamos eso directo
        if (res && res.data) {
            return res.data;
        }
        return res;
    },
    error => {
        // Aquí podrías manejar errores 401/403 globales
        console.error("❌ Error API:", error);
        return Promise.reject(error);
    }
);

export default api;
