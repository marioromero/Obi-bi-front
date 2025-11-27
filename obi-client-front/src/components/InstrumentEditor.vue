<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { apiLocal, apiCloud, sessionState } from '../api';
import ResultTable from './ResultTable.vue';

const props = defineProps({
  dashboardId: { type: Number, required: true },
  initialReport: { type: Object, default: null } // Si viene, estamos editando
});

const emit = defineEmits(['close', 'saved']);

// --- ESTADO ---
// Si estamos editando, iniciamos con los datos del reporte
const reportName = ref(props.initialReport?.name || 'Nuevo Instrumento');
const conversationId = ref(props.initialReport?.conversation_id || null);
const sqlQuery = ref(props.initialReport?.sql_query || '');
const executionResult = ref(null);

// Chat
const messages = ref([]); // Historial visual local
const currentQuestion = ref('');
const isProcessing = ref(false);
const errorMsg = ref('');

// Contexto (Cargamos todas las tablas publicadas por ahora)
const cloudMap = ref({});
const selectedTableIds = ref([]);

// --- CARGA INICIAL ---
onMounted(async () => {
  await loadContext();

  // Si es edición, ejecutamos la consulta guardada inmediatamente
  if (props.initialReport) {
    messages.value.push({ role: 'user', text: props.initialReport.question || 'Consulta guardada' });
    messages.value.push({ role: 'ai', text: 'Cargando vista previa...' });
    await executeSQL(props.initialReport.sql_query);
  }
});

// Cargar metadatos para saber qué tablas existen (Contexto Global del Agente)
const loadContext = async () => {
  try {
    // Buscamos todos los borradores sincronizados para armar el mapa de IDs
    const conns = await apiLocal.get('/connections');
    let allIds = {};

    for (const conn of conns) {
      try {
        const draft = await apiLocal.get('/schema/draft', { params: { connection_key: conn.key } });
        if (draft.is_synced && draft.cloud_refs_json) {
           const refs = JSON.parse(draft.cloud_refs_json);
           Object.assign(allIds, refs);
        }
      } catch (e) { continue; }
    }
    cloudMap.value = allIds;
    // Por defecto seleccionamos todo el contexto (o filtrar por dashboard a futuro)
    selectedTableIds.value = Object.values(allIds);
  } catch (e) {
    console.error("Error cargando contexto", e);
  }
};

// --- LÓGICA CHAT IA ---
const askAI = async () => {
  if (!currentQuestion.value.trim()) return;

  const q = currentQuestion.value;
  currentQuestion.value = ''; // Limpiar input
  messages.value.push({ role: 'user', text: q }); // Agregar al chat visual

  isProcessing.value = true;
  errorMsg.value = '';

  try {
    const payload = {
      question: q,
      schema_table_ids: selectedTableIds.value,
      conversation_id: conversationId.value, // Mantiene el hilo
      schema_config: []
    };

    const res = await apiCloud.post('/translate', payload);
    const data = res.data || res; // Ajuste por si axios ya desempaquetó

    // 1. Guardar ID de conversación
    if (data.conversation_id) conversationId.value = data.conversation_id;

    // 2. Caso Éxito (SQL)
    if (data.sql) {
        sqlQuery.value = data.sql;
        messages.value.push({ role: 'ai', text: 'Entendido. He actualizado la vista.' });
        await executeSQL(data.sql);
    }
    // 3. Caso Feedback
    else if (data.feedback) {
        let msg = "Necesito aclarar algo: ";
        if (data.feedback.missing_context) msg += data.feedback.missing_context.join(' ');
        if (data.feedback.error) msg += data.feedback.error;
        messages.value.push({ role: 'system', text: msg });
    }

  } catch (e) {
    const txt = e.response?.data?.message || e.message;
    messages.value.push({ role: 'error', text: 'Error: ' + txt });
  } finally {
    isProcessing.value = false;
  }
};

// Ejecutar SQL en Local
const executeSQL = async (sql) => {
  try {
    const res = await apiLocal.post('/execute', { sql });
    executionResult.value = res;
  } catch (e) {
    errorMsg.value = "Error de ejecución SQL: " + e.message;
  }
};

// --- GUARDAR / ACTUALIZAR ---
const saveInstrument = async () => {
  if (!sqlQuery.value) return;

  isProcessing.value = true;
  try {
    const payload = {
        name: reportName.value,
        user_identifier: sessionState.value.user || 'unknown',
        sql_query: sqlQuery.value,
        question: messages.value.findLast(m => m.role === 'user')?.text || '',
        conversation_id: conversationId.value,
        dashboard_id: props.dashboardId,
        type: 'table',
        scope: 'personal'
    };

    if (props.initialReport) {
        // UPDATE (PUT)
        await apiLocal.put(`/reports/${props.initialReport.id}`, payload);
    } else {
        // CREATE (POST)
        await apiLocal.post('/reports/', payload);
    }

    emit('saved'); // Avisar al padre para recargar
    emit('close'); // Cerrar editor
  } catch (e) {
    alert("Error al guardar: " + e.message);
  } finally {
    isProcessing.value = false;
  }
};
</script>

<template>
  <div class="fixed inset-0 bg-white z-50 flex flex-col">

    <!-- HEADER TOOLBAR -->
    <header class="h-14 border-b border-slate-200 flex items-center justify-between px-4 bg-white shadow-sm z-10">
        <div class="flex items-center gap-4">
            <button @click="$emit('close')" class="text-slate-400 hover:text-slate-600">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            <input
                v-model="reportName"
                class="font-bold text-slate-700 text-lg border-none focus:ring-0 placeholder-slate-300"
                placeholder="Nombre del Instrumento..."
            />
        </div>
        <div class="flex gap-2">
            <button
                @click="saveInstrument"
                :disabled="!sqlQuery || isProcessing"
                class="bg-indigo-600 text-white px-4 py-1.5 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:bg-slate-300 transition flex items-center gap-2"
            >
                <span v-if="isProcessing" class="animate-spin">↻</span>
                {{ initialReport ? 'Guardar Cambios' : 'Crear Instrumento' }}
            </button>
        </div>
    </header>

    <!-- MAIN WORKSPACE (Split View) -->
    <div class="flex-1 flex overflow-hidden">

        <!-- ZONA IZQUIERDA: CANVAS (RESULTADOS) -->
        <div class="flex-1 bg-slate-50 p-6 overflow-hidden flex flex-col relative">
            <div class="flex-1 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <ResultTable
                    v-if="executionResult"
                    :columns="executionResult.columns"
                    :rows="executionResult.rows"
                    :row-count="executionResult.row_count"
                />
                <div v-else class="h-full flex flex-col items-center justify-center text-slate-400">
                    <svg class="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                    <p>El lienzo está vacío. Usa el chat para generar datos.</p>
                </div>
            </div>

            <!-- Debug SQL (Opcional, oculto por defecto o pequeño abajo) -->
            <div v-if="sqlQuery" class="mt-2 text-[10px] text-slate-400 font-mono truncate px-2">
                SQL: {{ sqlQuery }}
            </div>
        </div>

        <!-- ZONA DERECHA: CHAT CONTEXTUAL -->
        <div class="w-96 bg-white border-l border-slate-200 flex flex-col">

            <!-- Historial de Mensajes -->
            <div class="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                <div v-if="messages.length === 0" class="text-center mt-10">
                    <p class="text-sm text-slate-500">Hola, soy tu analista de datos.</p>
                    <p class="text-xs text-slate-400 mt-1">Pídeme reportes, filtros o análisis.</p>
                </div>

                <div
                    v-for="(msg, idx) in messages"
                    :key="idx"
                    class="flex flex-col"
                    :class="msg.role === 'user' ? 'items-end' : 'items-start'"
                >
                    <div
                        class="max-w-[90%] p-3 rounded-lg text-sm shadow-sm"
                        :class="{
                            'bg-indigo-600 text-white rounded-br-none': msg.role === 'user',
                            'bg-white border border-slate-200 text-slate-700 rounded-bl-none': msg.role === 'ai',
                            'bg-amber-50 border border-amber-200 text-amber-800': msg.role === 'system',
                            'bg-red-50 text-red-700 border border-red-200': msg.role === 'error'
                        }"
                    >
                        {{ msg.text }}
                    </div>
                </div>

                <!-- Indicador de escritura -->
                <div v-if="isProcessing" class="flex items-center gap-1 text-slate-400 text-xs p-2">
                    <span>Analizando...</span>
                    <span class="animate-bounce">.</span><span class="animate-bounce delay-100">.</span><span class="animate-bounce delay-200">.</span>
                </div>
            </div>

            <!-- Input Area -->
            <div class="p-4 bg-white border-t border-slate-200">
                <div class="relative">
                    <textarea
                        v-model="currentQuestion"
                        @keydown.enter.prevent="askAI"
                        placeholder="Escribe tu instrucción..."
                        class="w-full border border-slate-300 rounded-lg pl-3 pr-10 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                        rows="2"
                    ></textarea>
                    <button
                        @click="askAI"
                        :disabled="isProcessing || !currentQuestion"
                        class="absolute right-2 bottom-2 text-indigo-600 hover:text-indigo-800 disabled:text-slate-300"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                    </button>
                </div>
                <p class="text-[10px] text-slate-400 mt-2 text-center">
                    Contexto: {{ Object.keys(cloudMap).length }} tablas disponibles.
                </p>
            </div>
        </div>

    </div>
  </div>
</template>
