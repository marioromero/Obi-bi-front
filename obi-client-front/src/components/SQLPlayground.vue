<script setup>
import {ref, computed} from 'vue';
import api from '../api';
import ResultTable from './ResultTable.vue';

// --- ESTADO EJECUCIÓN ---
const sqlQuery = ref('SELECT * FROM grupoint_obi_cases.priorities LIMIT 10');
const result = ref(null);
const isLoading = ref(false);
const errorMsg = ref('');
const executionTime = ref(0);

// --- ESTADO GUARDADO (NUEVO) ---
const showSaveForm = ref(false);
const isSaving = ref(false);
const saveSuccessMsg = ref('');

// Modelo del nuevo reporte
const newReport = ref({
  name: '',
  description: '',
  sql_query: '',
  scope: 'personal', // personal | global | role
  scope_target: ''   // string separado por comas para la UI
});

// Obtener usuario actual del contexto (para enviarlo al guardar)
const getCurrentUser = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('u') || 'dev_admin';
};

// --- FUNCIONES ---

const executeSQL = async () => {
  if (!sqlQuery.value.trim()) return;
  isLoading.value = true;
  errorMsg.value = '';
  result.value = null;
  const startTime = performance.now();

  try {
    const res = await api.post('/execute', {sql: sqlQuery.value});
    result.value = res;
  } catch (e) {
    errorMsg.value = e.response?.data?.detail || e.message;
  } finally {
    executionTime.value = ((performance.now() - startTime) / 1000).toFixed(2);
    isLoading.value = false;
  }
};

const openSaveModal = () => {
  // Pre-llenamos el SQL con lo que hay en el editor
  newReport.value.sql_query = sqlQuery.value;
  newReport.value.name = '';
  newReport.value.scope = 'personal';
  saveSuccessMsg.value = '';
  showSaveForm.value = true;
};

const saveReport = async () => {
  isSaving.value = true;
  errorMsg.value = '';

  try {
    // Preparamos el payload
    const payload = {
      name: newReport.value.name,
      description: newReport.value.description,
      sql_query: newReport.value.sql_query,
      scope: newReport.value.scope,
      user_identifier: getCurrentUser(),
      scope_target: []
    };

    // Lógica de transformación de roles (String "A, B" -> Array ["A", "B"])
    if (newReport.value.scope === 'role' && newReport.value.scope_target) {
      payload.scope_target = newReport.value.scope_target
          .split(',')
          .map(r => r.trim())
          .filter(r => r.length > 0);
    }

    await api.post('/reports/', payload);

    saveSuccessMsg.value = "¡Reporte guardado exitosamente!";
    showSaveForm.value = false; // Cerrar modal

    // Limpiar mensaje de éxito después de 3 segundos
    setTimeout(() => {
      saveSuccessMsg.value = ''
    }, 3000);

  } catch (e) {
    errorMsg.value = "Error al guardar: " + (e.response?.data?.detail || e.message);
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <div class="flex flex-col h-[650px] gap-4 relative">

    <div v-if="showSaveForm"
         class="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        <div class="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h3 class="font-bold text-slate-700">Guardar como Reporte</h3>
          <button @click="showSaveForm = false" class="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div class="p-6 space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre del Reporte</label>
            <input v-model="newReport.name" type="text" class="w-full border border-slate-300 ...">
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Descripción (Opcional)</label>
            <input v-model="newReport.description" type="text"
                   class="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none"
                   placeholder="Breve explicación...">
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Visibilidad (Scope)</label>
            <select v-model="newReport.scope"
                    class="w-full border border-slate-300 rounded px-3 py-2 text-sm outline-none bg-white">
              <option value="personal">🔒 Personal (Solo yo)</option>
              <option value="global">🌍 Global (Toda la empresa)</option>
              <option value="role">👥 Por Rol (Específico)</option>
            </select>
          </div>

          <div v-if="newReport.scope === 'role'" class="bg-indigo-50 p-3 rounded border border-indigo-100">
            <label class="block text-xs font-bold text-indigo-700 uppercase mb-1">Roles Permitidos</label>
            <input v-model="newReport.scope_target" type="text"
                   class="w-full border border-indigo-200 rounded px-3 py-2 text-sm outline-none"
                   placeholder="Ej: admin, gerencia, ventas (separar por coma)">
            <p class="text-[10px] text-indigo-500 mt-1">Solo usuarios con estos roles (inyectados en el iframe) podrán
              ver este reporte.</p>
          </div>
        </div>

        <div class="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button @click="showSaveForm = false"
                  class="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded font-medium">Cancelar
          </button>
          <button
              @click="saveReport"
              :disabled="!newReport.name || isSaving"
              class="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded hover:bg-indigo-700 disabled:bg-indigo-300 transition flex items-center gap-2"
          >
            <span v-if="isSaving" class="animate-spin">↻</span>
            Guardar Reporte
          </button>
        </div>
      </div>
    </div>

    <div v-if="saveSuccessMsg"
         class="absolute top-0 left-0 right-0 mx-auto w-max z-40 bg-green-600 text-white px-6 py-2 rounded-full shadow-lg text-sm font-bold animate-bounce mt-2">
      ✅ {{ saveSuccessMsg }}
    </div>

    <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-2">
      <div class="flex justify-between items-center mb-1">
        <label class="text-xs font-bold text-slate-500 uppercase">Consulta SQL (Simulación IA)</label>

        <div class="flex items-center gap-4">
           <span v-if="executionTime > 0 && !isLoading" class="text-[10px] text-slate-400">
             Ejecutado en {{ executionTime }}s
           </span>
          <button
              @click="openSaveModal"
              class="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
          >
            💾 Guardar esta consulta
          </button>
        </div>
      </div>

      <textarea
          v-model="sqlQuery"
          class="w-full h-24 p-3 font-mono text-sm text-slate-800 bg-slate-50 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
          placeholder="Escribe tu SELECT aquí..."
      ></textarea>

      <div class="flex justify-end">
        <button
            @click="executeSQL"
            :disabled="isLoading || !sqlQuery"
            class="px-6 py-2 bg-slate-900 text-white text-sm font-bold rounded hover:bg-slate-800 disabled:bg-slate-400 transition shadow-sm flex items-center gap-2"
        >
          <span v-if="isLoading" class="animate-spin">↻</span>
          {{ isLoading ? 'Ejecutando...' : '▶ Ejecutar Consulta' }}
        </button>
      </div>

      <div v-if="errorMsg"
           class="mt-2 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs font-mono break-all">
        {{ errorMsg }}
      </div>
    </div>

    <div class="flex-1 min-h-0">
      <ResultTable
          v-if="result"
          :columns="result.columns"
          :rows="result.rows"
          :row-count="result.row_count"
      />
      <div v-else
           class="h-full border border-slate-200 border-dashed rounded-lg flex items-center justify-center text-slate-400 bg-slate-50/50">
        <p>Ejecuta una consulta para ver datos</p>
      </div>
    </div>

  </div>
</template>
