<script setup>
import { ref, onMounted } from 'vue';
import { apiLocal, apiCloud } from '../api';
import ResultTable from './ResultTable.vue';

// --- ESTADO ---
const connections = ref([]);
const activeConnection = ref(null);
const draftData = ref(null);
const cloudMap = ref({});

// Contexto y Chat
const selectedTables = ref([]);
const userQuestion = ref('');
const currentConversationId = ref(null); // Mantiene el hilo de conversación

// Estado de Procesos
const isTranslating = ref(false);
const isExecuting = ref(false);
const errorMsg = ref('');
const aiFeedbackMsg = ref(''); // NUEVO: Para mensajes de clarificación de la IA
const step = ref(1);

// Resultados
const generatedSQL = ref('');
const executionResult = ref(null);

// --- CARGA INICIAL ---
const loadConnections = async () => {
  try {
    connections.value = await apiLocal.get('/connections');
  } catch (e) {
    errorMsg.value = "Error al cargar conexiones: " + e.message;
  }
};

// --- SELECCIÓN DE BD ---
const selectConnection = async (conn) => {
  activeConnection.value = conn;
  errorMsg.value = '';
  draftData.value = null;
  cloudMap.value = {};
  selectedTables.value = [];
  currentConversationId.value = null; // Reiniciar conversación al cambiar contexto

  try {
    const res = await apiLocal.get('/schema/draft', { params: { connection_key: conn.key } });

    if (!res.is_synced || !res.cloud_refs_json) {
      errorMsg.value = "⚠️ Esta conexión no ha sido publicada en la nube. Ve a 'Esquemas' primero.";
      return;
    }

    draftData.value = res;
    try {
        cloudMap.value = JSON.parse(res.cloud_refs_json);
    } catch (err) {
        cloudMap.value = {};
    }
    selectedTables.value = Object.values(cloudMap.value);
    step.value = 2;
  } catch (e) {
    if (e.response?.status === 404) {
      errorMsg.value = "Base de datos no escaneada. Ve a la pestaña 'Esquemas'.";
    } else {
      errorMsg.value = e.message;
    }
  }
};

// --- ACCIÓN 1: PREGUNTAR A LA IA (CLOUD) ---
const askAI = async () => {
  if (!userQuestion.value.trim()) return;
  if (selectedTables.value.length === 0) {
    alert("Selecciona al menos una tabla.");
    return;
  }

  isTranslating.value = true;
  errorMsg.value = '';
  aiFeedbackMsg.value = '';
  generatedSQL.value = '';
  executionResult.value = null;

  try {
    const payload = {
      question: userQuestion.value,
      schema_table_ids: selectedTables.value,
      conversation_id: currentConversationId.value, // Enviamos null la primera vez, el ID después
      schema_config: []
    };

    console.log("📡 Enviando a Laravel:", payload);

    // Axios interceptor devuelve res.data, así que 'res' es { status: true, data: {...} }
    const res = await apiCloud.post('/translate', payload);
    console.log("📥 Respuesta Laravel:", res);

    const innerData = res.data; // Aquí está { sql: ..., usage: ..., conversation_id: ... }

    if (!innerData) {
        throw new Error("Respuesta vacía del servidor.");
    }

    // 1. Actualizar ID de conversación para el futuro
    if (innerData.conversation_id) {
        currentConversationId.value = innerData.conversation_id;
    }

    // 2. Escenario A: Éxito (Tenemos SQL)
    if (innerData.sql) {
        generatedSQL.value = innerData.sql;
    }
    // 3. Escenario B: Feedback / Clarificación
    else if (innerData.feedback) {
        const fb = innerData.feedback;
        let msg = "La IA necesita más información:";

        // Manejo específico de 'missing_context'
        if (fb.missing_context && Array.isArray(fb.missing_context)) {
            msg = fb.missing_context.join(" ");
        } else if (fb.error) {
            msg += " " + fb.error;
        }

        aiFeedbackMsg.value = msg;
    }
    // 4. Fallback
    else {
        console.error("Respuesta desconocida:", res);
        throw new Error("La IA respondió pero no generó SQL ni solicitó feedback.");
    }

  } catch (e) {
    console.error(e);
    const msg = e.response?.data?.message || e.message;
    errorMsg.value = `Error: ${msg}`;

    if (e.response?.status === 401) {
        errorMsg.value += " (Token inválido)";
    }
  } finally {
    isTranslating.value = false;
  }
};

// --- ACCIÓN 2: EJECUTAR SQL (LOCAL) ---
const executeSQL = async () => {
  if (!generatedSQL.value) return;

  isExecuting.value = true;
  try {
    const res = await apiLocal.post('/execute', { sql: generatedSQL.value });
    executionResult.value = res;
  } catch (e) {
    errorMsg.value = "Error SQL Local: " + (e.response?.data?.detail || e.message);
  } finally {
    isExecuting.value = false;
  }
};

onMounted(() => {
  loadConnections();
});
</script>

<template>
  <div class="h-[700px] flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden font-sans text-slate-800">

    <!-- PASO 1: SELECCIONAR CONEXIÓN -->
    <div v-if="step === 1" class="p-8 flex flex-col items-center justify-center h-full text-center">
       <div class="mb-6 bg-indigo-50 p-4 rounded-full shadow-inner">
         <span class="text-4xl">✨</span>
       </div>
       <h2 class="text-2xl font-bold text-slate-800 mb-2">Asistente de Inteligencia</h2>
       <p class="text-slate-500 mb-8 max-w-md">Selecciona una base de datos para comenzar a hacer preguntas sobre tu negocio.</p>

       <div class="w-full max-w-xs space-y-3">
         <button
           v-for="conn in connections"
           :key="conn.key"
           @click="selectConnection(conn)"
           class="w-full p-4 border border-slate-200 rounded-lg hover:border-indigo-500 hover:shadow-md hover:bg-indigo-50 transition text-left flex justify-between items-center group bg-white"
         >
           <span class="font-bold text-slate-700 group-hover:text-indigo-700">{{ conn.key }}</span>
           <span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded uppercase font-bold tracking-wide">{{ conn.type }}</span>
         </button>
       </div>

       <div v-if="errorMsg" class="mt-6 p-4 bg-red-50 text-red-700 text-sm rounded-lg max-w-md border border-red-100 flex items-start gap-2">
         <span>⚠️</span>
         <p class="text-left">{{ errorMsg }}</p>
       </div>
    </div>

    <!-- PASO 2: INTERFAZ DE CHAT -->
    <div v-else class="flex h-full">

       <!-- SIDEBAR: CONTEXTO -->
       <aside class="w-72 bg-slate-50 border-r border-slate-200 flex flex-col flex-shrink-0">
          <div class="p-4 border-b border-slate-200 bg-white">
             <button @click="step = 1" class="text-xs text-slate-500 hover:text-indigo-600 mb-2 flex items-center gap-1 font-medium">
               ← Cambiar Base de Datos
             </button>
             <h3 class="font-bold text-slate-800 truncate text-sm" :title="activeConnection.key">{{ activeConnection.key }}</h3>
             <p class="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1 bg-emerald-50 w-fit px-2 py-0.5 rounded-full border border-emerald-100">
                ● Conectado a Nube
             </p>
          </div>

          <div class="p-3 bg-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200">
             Contexto (Tablas Activas)
          </div>

          <div class="flex-1 overflow-y-auto p-2 space-y-1">
             <label
               v-for="(id, name) in cloudMap"
               :key="id"
               class="flex items-start gap-2 p-2 rounded hover:bg-white cursor-pointer transition select-none group"
             >
                <input type="checkbox" v-model="selectedTables" :value="id" class="mt-0.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer">
                <span class="text-xs text-slate-600 break-all leading-tight group-hover:text-slate-900">{{ name }}</span>
             </label>
          </div>

          <div class="p-3 border-t border-slate-200 text-center bg-slate-50">
             <span class="text-[10px] text-slate-400 font-medium">{{ selectedTables.length }} tablas seleccionadas</span>
          </div>
       </aside>

       <!-- ÁREA PRINCIPAL: CHAT -->
       <main class="flex-1 flex flex-col min-w-0 bg-slate-100">

          <!-- CONTENEDOR DE MENSAJES/RESULTADOS -->
          <div class="flex-1 overflow-y-auto p-6 space-y-6">

             <!-- Bienvenida -->
             <div v-if="!generatedSQL && !errorMsg && !aiFeedbackMsg" class="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
                <div class="bg-slate-200 p-4 rounded-full mb-4">
                    <svg class="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
                </div>
                <p class="text-sm font-medium">Formula una pregunta para generar un reporte.</p>
             </div>

             <!-- A. FEEDBACK DE IA (CLARIFICACIÓN) -->
             <div v-if="aiFeedbackMsg" class="bg-blue-50 border-l-4 border-blue-500 text-blue-800 p-4 rounded shadow-sm flex gap-3 animate-in fade-in slide-in-from-bottom-2">
                <span class="text-xl">🤔</span>
                <div>
                    <p class="font-bold text-sm">La IA necesita ayuda:</p>
                    <p class="text-sm mt-1">{{ aiFeedbackMsg }}</p>
                    <p class="text-xs mt-2 text-blue-600 opacity-80">Por favor, agrega más detalles en tu siguiente mensaje.</p>
                </div>
             </div>

             <!-- B. SQL GENERADO -->
             <div v-if="generatedSQL" class="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div class="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                   <div class="flex items-center gap-2">
                       <span class="text-lg">🤖</span>
                       <span class="text-xs font-bold text-slate-600 uppercase">Respuesta IA</span>
                   </div>
                   <button
                     v-if="!executionResult"
                     @click="executeSQL"
                     :disabled="isExecuting"
                     class="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded font-medium hover:bg-indigo-700 transition flex items-center gap-1 shadow-sm"
                   >
                      <span v-if="isExecuting" class="animate-spin">↻</span>
                      {{ isExecuting ? 'Ejecutando...' : '▶ Ejecutar Consulta' }}
                   </button>
                </div>
                <div class="p-4 bg-slate-900 text-green-400 font-mono text-xs overflow-x-auto leading-relaxed">
                   {{ generatedSQL }}
                </div>
             </div>

             <!-- C. TABLA DE RESULTADOS -->
             <div v-if="executionResult" class="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden h-96 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
                <ResultTable
                   :columns="executionResult.columns"
                   :rows="executionResult.rows"
                   :row-count="executionResult.row_count"
                />
             </div>

             <!-- D. ERRORES TÉCNICOS -->
             <div v-if="errorMsg" class="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-sm flex gap-3">
                <span class="text-xl">⚠️</span>
                <div>
                    <p class="font-bold text-sm">Error técnico:</p>
                    <p class="text-sm mt-1">{{ errorMsg }}</p>
                </div>
             </div>

          </div>

          <!-- INPUT AREA -->
          <div class="p-4 bg-white border-t border-slate-200">
             <div class="relative max-w-4xl mx-auto">
                <textarea
                  v-model="userQuestion"
                  @keydown.enter.prevent="askAI"
                  class="w-full border border-slate-300 rounded-xl pl-4 pr-14 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none shadow-sm transition-shadow"
                  rows="2"
                  placeholder="Escribe tu pregunta aquí..."
                ></textarea>

                <button
                  @click="askAI"
                  :disabled="isTranslating || !userQuestion"
                  class="absolute right-2 bottom-2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition shadow-sm"
                >
                   <span v-if="isTranslating" class="animate-spin block w-5 h-5 border-2 border-white/30 border-t-white rounded-full"></span>
                   <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                </button>
             </div>
             <p class="text-[10px] text-slate-400 mt-2 text-center flex justify-center gap-1">
                <span>Analizando {{ selectedTables.length }} tablas.</span>
             </p>
          </div>

       </main>
    </div>

  </div>
</template>
