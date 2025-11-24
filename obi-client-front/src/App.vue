<script setup>
import {ref, onMounted} from 'vue';
import {setApiContext} from './api';
// Importamos los componentes
import ReportViewer from './components/ReportViewer.vue';
import SchemaManager from './components/SchemaManager.vue';
import SQLPlayground from './components/SQLPlayground.vue';

const isReady = ref(false);
const userInfo = ref({user: '', role: ''});

// Navegación simple
const currentTab = ref('admin'); // 'admin' | 'playground'

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  // Leemos los params o usamos defaults para dev
  const user = params.get('u') || 'dev_admin';
  const role = params.get('r') || 'admin';

  userInfo.value = {user, role};
  setApiContext(user, role);
  isReady.value = true;
});
</script>

<template>
  <div class="min-h-screen bg-slate-100 font-sans text-slate-800 pb-10">

    <header class="bg-white shadow-sm border-b border-slate-200 px-6 py-3 sticky top-0 z-50">
      <div class="container mx-auto flex justify-between items-center">

        <div class="flex items-center gap-3">
          <div
              class="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-sm">
            OB
          </div>
          <div>
            <h1 class="text-base font-bold text-slate-800 leading-none">OBI Client Agent</h1>
            <p class="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Entorno de Agente Local</p>
          </div>
        </div>

        <div class="flex bg-slate-100 p-1 rounded-lg mx-4">
          <button
              @click="currentTab = 'admin'"
              class="px-4 py-1.5 text-xs font-bold rounded-md transition-all"
              :class="currentTab === 'admin' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
          >
            🛠️ Admin Esquemas
          </button>
          <button
              @click="currentTab = 'playground'"
              class="px-4 py-1.5 text-xs font-bold rounded-md transition-all"
              :class="currentTab === 'playground' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
          >
            ⚡ Consola SQL
          </button>
          <button
              @click="currentTab = 'reports'"
              class="px-4 py-1.5 text-xs font-bold rounded-md transition-all"
              :class="currentTab === 'reports' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
          >
            📊 Mis Reportes
          </button>
        </div>

        <div class="text-right text-xs border-l pl-4 border-slate-200 hidden md:block">
          <p class="text-slate-400">Conectado como</p>
          <p class="font-semibold text-slate-700">{{ userInfo.user }}</p>
        </div>
      </div>
    </header>

    <main class="container mx-auto px-4 py-6">

      <div v-if="currentTab === 'admin'">
        <SchemaManager/>
      </div>

      <div v-else-if="currentTab === 'playground'">
        <SQLPlayground/>
      </div>

      <div v-else-if="currentTab === 'reports'">
        <ReportViewer/>
      </div>

    </main>

  </div>
</template>
