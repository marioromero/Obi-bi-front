<script setup>
import { ref, onMounted } from 'vue';
import { initHandshake, sessionState } from './api';

// Componentes
import SchemaManager from './components/SchemaManager.vue';
import SQLPlayground from './components/SQLPlayground.vue';
import ReportViewer from './components/ReportViewer.vue';

const currentTab = ref('reports'); // Pestaña por defecto: Reportes (la más usada por usuarios finales)

onMounted(async () => {
  // Iniciamos la negociación de seguridad (Handshake)
  // Esto detectará si estamos en Dev o esperando al Iframe
  await initHandshake();
});
</script>

<template>
  <div class="min-h-screen bg-slate-100 font-sans text-slate-800 pb-10">

    <div v-if="!sessionState.isReady" class="h-screen flex flex-col items-center justify-center bg-white">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
      <h2 class="text-xl font-bold text-slate-700">Iniciando Agente OBI</h2>
      <p class="text-slate-500 mt-2">Verificando credenciales y plan...</p>
    </div>

    <div v-else>

      <header class="bg-white shadow-sm border-b border-slate-200 px-6 py-3 sticky top-0 z-50">
        <div class="container mx-auto flex justify-between items-center">

          <div class="flex items-center gap-3">
             <div class="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-sm">OB</div>
             <div>
               <h1 class="text-base font-bold text-slate-800 leading-none">OBI Client Agent</h1>
               <p class="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
                 {{ sessionState.companyName || 'Modo Local' }}
               </p>
             </div>
          </div>

          <div class="flex bg-slate-100 p-1 rounded-lg mx-4">
            <button
              @click="currentTab = 'reports'"
              class="px-4 py-1.5 text-xs font-bold rounded-md transition-all"
              :class="currentTab === 'reports' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
            >
              📊 Mis Reportes
            </button>

            <button
              disabled
              class="px-4 py-1.5 text-xs font-bold rounded-md text-slate-400 cursor-not-allowed flex items-center gap-1 opacity-50"
              title="Próximamente"
            >
              ✨ Preguntar a IA
            </button>

            <div class="w-px h-4 bg-slate-300 mx-1"></div>

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

          <div class="text-right text-xs border-l pl-4 border-slate-200 hidden md:block">
            <p class="text-slate-400">Usuario</p>
            <p class="font-semibold text-slate-700">{{ sessionState.user }}</p>
          </div>
        </div>
      </header>

      <main class="container mx-auto px-4 py-6">
        <ReportViewer v-if="currentTab === 'reports'" />
        <SchemaManager v-else-if="currentTab === 'admin'" />
        <SQLPlayground v-else-if="currentTab === 'playground'" />
      </main>

    </div>
  </div>
</template>
