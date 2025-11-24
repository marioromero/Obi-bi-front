<script setup>
import { ref, onMounted } from 'vue';
import api from '../api';
import ResultTable from './ResultTable.vue';

// Estado
const reports = ref([]);
const selectedReport = ref(null); // El reporte activo
const executionResult = ref(null);
const isLoadingList = ref(false);
const isExecuting = ref(false);
const errorMsg = ref('');

// Cargar lista (El backend filtra por nosotros gracias al api.js)
const loadReports = async () => {
  isLoadingList.value = true;
  errorMsg.value = '';
  try {
    const res = await api.get('/reports/');
    reports.value = res;
  } catch (e) {
    errorMsg.value = "Error cargando reportes: " + e.message;
  } finally {
    isLoadingList.value = false;
  }
};

// Ejecutar un reporte clickeado
const openReport = async (report) => {
  selectedReport.value = report;
  isExecuting.value = true;
  executionResult.value = null;

  try {
    // Usamos el endpoint de ejecutar pasando el SQL guardado
    const res = await api.post('/execute', { sql: report.sql_query });
    executionResult.value = res;
  } catch (e) {
    errorMsg.value = "Error ejecutando reporte: " + e.message;
  } finally {
    isExecuting.value = false;
  }
};

const backToList = () => {
  selectedReport.value = null;
  executionResult.value = null;
  // Recargamos por si hubo nuevos guardados
  loadReports();
};

onMounted(() => {
  loadReports();
});
</script>

<template>
  <div class="h-[650px] flex flex-col relative">

    <div v-if="!selectedReport" class="h-full flex flex-col">

       <div class="flex justify-between items-center mb-4 px-2">
          <h2 class="text-lg font-bold text-slate-700">Mis Reportes Disponibles</h2>
          <button @click="loadReports" class="text-sm text-indigo-600 hover:underline">↻ Actualizar</button>
       </div>

       <div v-if="isLoadingList" class="flex-1 flex items-center justify-center">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
       </div>

       <div v-else-if="reports.length === 0" class="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          <p>No tienes reportes asignados.</p>
          <p class="text-xs mt-2">Ve a la Consola SQL para crear uno.</p>
       </div>

       <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pb-4 px-2">
          <div
            v-for="rep in reports"
            :key="rep.id"
            @click="openReport(rep)"
            class="bg-white p-5 rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 cursor-pointer transition group relative overflow-hidden"
          >
             <div class="absolute top-0 right-0 px-2 py-1 rounded-bl text-[10px] font-bold uppercase tracking-wider"
               :class="{
                 'bg-indigo-100 text-indigo-700': rep.scope === 'personal',
                 'bg-emerald-100 text-emerald-700': rep.scope === 'global',
                 'bg-amber-100 text-amber-700': rep.scope === 'role'
               }">
               {{ rep.scope }}
             </div>

             <h3 class="font-bold text-slate-800 mb-1 group-hover:text-indigo-700">{{ rep.name }}</h3>
             <p class="text-xs text-slate-500 line-clamp-2 mb-3 h-8">{{ rep.description || 'Sin descripción' }}</p>

             <div class="flex items-center text-[10px] text-slate-400 font-mono gap-2">
                <span class="bg-slate-100 px-1.5 py-0.5 rounded">SQL</span>
                <span class="truncate max-w-[200px]">{{ rep.sql_query }}</span>
             </div>
          </div>
       </div>
    </div>

    <div v-else class="h-full flex flex-col">
       <div class="mb-4 flex items-center justify-between">
          <button @click="backToList" class="text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1">
             ← Volver a mis reportes
          </button>
          <h2 class="text-lg font-bold text-slate-800">{{ selectedReport.name }}</h2>
       </div>

       <div class="flex-1 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div v-if="isExecuting" class="flex-1 flex flex-col items-center justify-center">
             <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
             <p class="text-slate-500">Ejecutando consulta en tiempo real...</p>
          </div>

          <div v-else-if="errorMsg" class="p-8 text-center">
             <div class="text-red-500 text-4xl mb-4">⚠️</div>
             <p class="text-red-700">{{ errorMsg }}</p>
             <button @click="openReport(selectedReport)" class="mt-4 text-indigo-600 underline">Reintentar</button>
          </div>

          <div v-else-if="executionResult" class="flex-1 min-h-0">
             <ResultTable
               :columns="executionResult.columns"
               :rows="executionResult.rows"
               :row-count="executionResult.row_count"
             />
          </div>
       </div>
    </div>

  </div>
</template>
