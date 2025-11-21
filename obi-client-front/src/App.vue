<script setup>
import { ref, onMounted } from 'vue';
import { setApiContext } from './api'; // Importamos nuestra función

// Estado local
const isReady = ref(false);
const errorMessage = ref('');
const userInfo = ref({ user: '', role: '' });

onMounted(() => {
  // 1. Leer parámetros de la URL (Simulación de Iframe)
  const params = new URLSearchParams(window.location.search);
  const user = params.get('u');
  const role = params.get('r');

  // MODO DESARROLLO: Si no hay params, usamos unos default para no trabarnos
  if (!user) {
    console.warn("⚠️ No se detectaron params en URL. Usando modo DEV.");
    userInfo.value = { user: 'dev_admin', role: 'admin' }; // Default Dev
  } else {
    userInfo.value = { user, role };
  }

  // 2. Configurar la API con estos datos
  setApiContext(userInfo.value.user, userInfo.value.role);
  isReady.value = true;
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-800">

    <div v-if="!isReady" class="flex h-screen items-center justify-center">
      <p class="text-lg text-slate-500 animate-pulse">Inicializando Agente...</p>
    </div>

    <div v-else class="container mx-auto p-6">

      <header class="mb-8 flex justify-between items-center border-b border-slate-200 pb-4">
        <div>
          <h1 class="text-2xl font-bold text-indigo-700">OBI Client Agent</h1>
          <p class="text-sm text-slate-500">Sistema Híbrido de Inteligencia</p>
        </div>
        <div class="text-right text-xs text-slate-400">
          <p>Usuario: <span class="font-mono text-slate-600">{{ userInfo.user }}</span></p>
          <p>Rol: <span class="font-mono text-slate-600">{{ userInfo.role }}</span></p>
        </div>
      </header>

      <main class="bg-white rounded-lg shadow p-6 min-h-[400px] flex items-center justify-center border border-slate-100">
        <div class="text-center">
          <p class="text-slate-400 mb-4">El sistema está listo para recibir módulos.</p>
          <button class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition">
            Probar Conexión (Siguiente Paso)
          </button>
        </div>
      </main>

    </div>
  </div>
</template>
