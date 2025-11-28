<script setup>
import { ref, onMounted } from 'vue';
import { initHandshake, sessionState } from './api';

// Importación de Componentes
import SchemaManager from './components/SchemaManager.vue';
import SQLPlayground from './components/SQLPlayground.vue';
import DashboardLayout from "./components/DashboardLayout.vue";

const currentTab = ref('dashboards'); // Pestaña inicial por defecto

onMounted(async () => {
  // Iniciamos la negociación de seguridad (Handshake)
  await initHandshake();
});
</script>

<template>
  <div class="min-h-screen bg-slate-100 font-sans text-slate-800 pb-10">

    <!-- ESTADO 1: CARGANDO / ESPERANDO AUTENTICACIÓN -->
    <div v-if="!sessionState.isReady" class="h-screen flex flex-col items-center justify-center bg-white">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
      <h2 class="text-xl font-bold text-slate-700">Iniciando Agente OBI</h2>
      <p class="text-slate-500 mt-2">Verificando credenciales y plan...</p>
    </div>

    <!-- ESTADO 2: APLICACIÓN LISTA -->
    <div v-else>

      <!-- Header Global -->
      <header class="bg-white shadow-sm border-b border-slate-200 px-6 py-3 sticky top-0 z-50">
        <div class="container mx-auto flex justify-between items-center">

          <!-- Logo y Empresa -->
          <div class="flex items-center gap-3">
             <div class="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-sm">OB</div>
             <div>
               <h1 class="text-base font-bold text-slate-800 leading-none">OBI Client Agent</h1>
               <p class="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
                 {{ sessionState.companyName || 'Modo Local' }}
               </p>
             </div>
          </div>

          <!-- Navegación -->
          <div class="flex bg-slate-100 p-1 rounded-lg mx-4">

            <!-- MÓDULO PRINCIPAL -->
            <button
              @click="currentTab = 'dashboards'"
              class="px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2"
              :class="currentTab === 'dashboards' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            >
              <span>📊</span> Dashboards
            </button>

            <div class="w-px h-4 bg-slate-300 mx-1 hidden md:block"></div>

            <!-- HERRAMIENTAS ADMIN -->
            <button
              @click="currentTab = 'admin'"
              class="px-4 py-1.5 text-xs font-bold rounded-md transition-all"
              :class="currentTab === 'admin' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            >
              🛠️ Esquemas
            </button>

            <button
              @click="currentTab = 'playground'"
              class="px-4 py-1.5 text-xs font-bold rounded-md transition-all"
              :class="currentTab === 'playground' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            >
              ⚡ SQL Lab
            </button>
          </div>

          <!-- Info Usuario -->
          <div class="text-right text-xs border-l pl-4 border-slate-200 hidden md:block">
            <p class="text-slate-400">Usuario</p>
            <p class="font-semibold text-slate-700">{{ sessionState.user }}</p>
          </div>
        </div>
      </header>

      <!-- Contenido Principal -->
      <main class="container mx-auto px-4 py-0 h-full">

        <DashboardLayout v-if="currentTab === 'dashboards'" />

        <SchemaManager v-else-if="currentTab === 'admin'" />

        <SQLPlayground v-else-if="currentTab === 'playground'" />

      </main>

    </div>
  </div>
</template>
