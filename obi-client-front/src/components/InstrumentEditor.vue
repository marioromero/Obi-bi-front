<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { apiLocal, apiCloud, sessionState } from '../api';
import ResultTable from './ResultTable.vue';

const props = defineProps({
  dashboardId: { type: Number, required: true },
  dashboardContext: { type: [String, Array], default: () => [] },
  initialReport: { type: Object, default: null }
});

const emit = defineEmits(['close', 'saved']);

// --- ESTADO DEL REPORTE ---
const reportName = ref(props.initialReport?.name || 'Nuevo Instrumento');
const conversationId = ref(props.initialReport?.conversation_id || null);
const sqlQuery = ref(props.initialReport?.sql_query || '');
const executionResult = ref(null);

// --- ESTADO DEL CHAT ---
const messages = ref([]);
const currentQuestion = ref('');
const isProcessing = ref(false);
const errorMsg = ref('');

// --- ESTADO DE UI ---
const isSqlVisible = ref(true); // Controla la visibilidad del visor SQL

// --- CONTEXTO ---
const parsedContext = computed(() => {
  if (!props.dashboardContext) return [];
  try {
    return typeof props.dashboardContext === 'string' 
      ? JSON.parse(props.dashboardContext) 
      : props.dashboardContext;
  } catch (e) {
    console.error("Error parsing dashboard context", e);
    return [];
  }
});

const contextSummary = computed(() => {
  const count = parsedContext.value.length;
  if (count === 0) return "Sin contexto configurado";
  return `${count} tablas configuradas (Optimizado)`;
});

// --- CARGA INICIAL ---
onMounted(async () => {
  if (props.initialReport) {
    messages.value.push({ 
      role: 'user', 
      text: props.initialReport.question || 'Consulta guardada' 
    });
    messages.value.push({ 
      role: 'ai', 
      text: 'He cargado tu consulta anterior. Los resultados se muestran en el canvas.' 
    });
    await executeSQL(props.initialReport.sql_query);
  } else {
    // Mensaje de bienvenida
    if (parsedContext.value.length === 0) {
      messages.value.push({
        role: 'system',
        text: '⚠️ Este dashboard no tiene tablas configuradas. Pide al administrador que configure el contexto de datos.'
      });
    }
  }
});

// --- LÓGICA CHAT IA ---
const askAI = async () => {
  console.log("🔍 Contexto actual:", JSON.parse(JSON.stringify(parsedContext.value)));
  if (!currentQuestion.value.trim()) return;

  if (parsedContext.value.length === 0) {
    alert('No hay tablas configuradas en este dashboard. Configura el contexto primero.');
    return;
  }

  // 1. VALIDACIÓN DE CONSISTENCIA
  const invalidTables = parsedContext.value.filter(item => {
    const tableId = item.table_id;
    const numericId = Number(tableId);
    return !tableId || !Number.isInteger(numericId) || numericId <= 0;
  });

  if (invalidTables.length > 0) {
    const tableNames = invalidTables.map(t => t.table_name || 'Desconocida').join(', ');
    const temporalTables = invalidTables.filter(t => String(t.table_id).startsWith('temp_'));
    const invalidFormatTables = invalidTables.filter(t => !String(t.table_id).startsWith('temp_') && !Number.isInteger(Number(t.table_id)));
    
    let errorMsg = `⛔ No puedo procesar la solicitud. Las siguientes tablas no están sincronizadas correctamente con la nube:\n\n`;
    
    if (temporalTables.length > 0) {
      errorMsg += `📝 Tablas con ID temporal (${temporalTables.length}): ` + temporalTables.map(t => t.table_name || 'Desconocida').join(', ') + '\n';
    }
    
    if (invalidFormatTables.length > 0) {
      errorMsg += `❌ Tablas con ID inválido (${invalidFormatTables.length}): ` + invalidFormatTables.map(t => t.table_name || 'Desconocida').join(', ') + '\n';
    }
    
    errorMsg += '\n💡 Solución: Ve a "Configurar Contexto", asegúrate de sincronizar el esquema con la nube, y guarda la configuración.\n';
    errorMsg += 'Las tablas con IDs temporales no aparecerán en el contexto hasta que se sincronicen.';

    messages.value.push({ role: 'user', text: currentQuestion.value });
    messages.value.push({
      role: 'system',
      text: errorMsg
    });

    currentQuestion.value = ''; 
    return;
  }

  // Si llegamos aquí, todo es válido
  const q = currentQuestion.value;
  currentQuestion.value = '';
  messages.value.push({ role: 'user', text: q });

  isProcessing.value = true;
  errorMsg.value = '';

  try {
    const schemaConfig = parsedContext.value.map(item => {
      const config = {
        table_id: Number(item.table_id),
        use_full_schema: false,
        include_columns: []
      };

      if (item.mode === 'full') {
        config.use_full_schema = true;
      } else if (item.mode === 'partial') {
        config.include_columns = item.columns || [];
      } else if (item.mode === 'default_only') {
        config.include_columns = [];
      }

      return config;
    });

    const schemaTableIds = parsedContext.value.map(item => Number(item.table_id));

    const payload = {
      question: q,
      schema_table_ids: schemaTableIds,
      conversation_id: conversationId.value,
      schema_config: schemaConfig
    };

    const res = await apiCloud.post('/translate', payload);
    const data = res.data || res;

    if (data.conversation_id) {
      conversationId.value = data.conversation_id;
    }

    if (data.sql) {
      sqlQuery.value = data.sql;
      messages.value.push({
        role: 'ai',
        text: 'Entendido. He generado la consulta y actualizado el canvas con los resultados.'
      });
      await executeSQL(data.sql);
      // Opcional: Mostrar SQL automáticamente si se genera uno nuevo
      // isSqlVisible.value = true; 
    }
    else if (data.feedback) {
      let msg = '🤔 ';
      if (data.feedback.missing_context) {
        msg += data.feedback.missing_context.join(' ');
      }
      if (data.feedback.error) {
        msg += data.feedback.error;
      }
      if (data.feedback.suggestion) {
        msg += ' ' + data.feedback.suggestion;
      }
      messages.value.push({ role: 'system', text: msg });
    }

  } catch (e) {
    const txt = e.response?.data?.message || e.message;
    const validationErrors = e.response?.data?.errors ? JSON.stringify(e.response.data.errors) : '';
    messages.value.push({ role: 'error', text: 'Error: ' + txt + ' ' + validationErrors });
  } finally {
    isProcessing.value = false;
  }
};

const executeSQL = async (sql) => {
  try {
    const res = await apiLocal.post('/execute', { sql });
    executionResult.value = res;
  } catch (e) {
    errorMsg.value = "Error de ejecución SQL: " + (e.response?.data?.message || e.message);
    messages.value.push({ 
      role: 'error', 
      text: 'Error ejecutando la consulta: ' + (e.response?.data?.message || e.message) 
    });
  }
};

// --- GUARDAR / ACTUALIZAR ---
const saveInstrument = async () => {
  if (!sqlQuery.value) {
    alert('No hay una consulta SQL para guardar. Usa el chat para generar una primero.');
    return;
  }

  isProcessing.value = true;
  try {
    const lastUserMessage = messages.value.filter(m => m.role === 'user').pop();
    
    const payload = {
      name: reportName.value,
      user_identifier: sessionState.value.user || 'unknown',
      sql_query: sqlQuery.value,
      question: lastUserMessage?.text || '',
      conversation_id: conversationId.value,
      dashboard_id: props.dashboardId,
      type: 'table',
      scope: 'personal'
    };

    if (props.initialReport) {
      await apiLocal.put(`/reports/${props.initialReport.id}`, payload);
    } else {
      await apiLocal.post('/reports/', payload);
    }

    emit('saved');
    emit('close');
  } catch (e) {
    alert("Error al guardar: " + (e.response?.data?.message || e.message));
  } finally {
    isProcessing.value = false;
  }
};

const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text);
};
</script>

<template>
  <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-white w-full h-full max-w-[1600px] max-h-[900px] rounded-xl shadow-2xl flex flex-col overflow-hidden">

      <!-- HEADER TOOLBAR -->
      <header class="h-14 border-b border-slate-200 flex items-center justify-between px-6 bg-gradient-to-r from-slate-50 to-white flex-shrink-0">
        <div class="flex items-center gap-4">
          <button 
            @click="$emit('close')" 
            class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-all"
            title="Cerrar editor"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
          
          <div class="flex flex-col">
            <input
              v-model="reportName"
              class="font-bold text-slate-800 text-lg bg-transparent border-none focus:ring-0 placeholder-slate-300 p-0"
              placeholder="Nombre del Instrumento..."
            />
          </div>
        </div>

        <div class="flex items-center gap-3">
          <!-- Context Summary Badge -->
          <div class="px-3 py-1 bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2">
            <svg class="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
            <span class="text-xs font-medium text-slate-600">Contexto: {{ contextSummary }}</span>
          </div>

          <button
            @click="saveInstrument"
            :disabled="!sqlQuery || isProcessing"
            class="flex items-center gap-2 bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
          >
            <svg v-if="isProcessing" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            {{ initialReport ? 'Guardar' : 'Crear' }}
          </button>
        </div>
      </header>

      <!-- MAIN WORKSPACE (Column Layout) -->
      <div class="flex-1 flex flex-col overflow-hidden bg-slate-50">

        <!-- TOP SECTION: CHAT & SQL -->
        <div class="flex border-b border-slate-200 h-[35%] min-h-[250px] max-h-[400px]">
          
          <!-- CHAT (Left) -->
          <div class="flex-1 flex flex-col bg-white">
            <!-- Chat Header -->
            <div class="px-4 py-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
              <div class="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                </svg>
              </div>
              <span class="text-sm font-semibold text-slate-700">Asistente BI</span>
            </div>

            <!-- Chat Messages -->
            <div class="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
              <div v-if="messages.length === 0" class="text-center py-4">
                <p class="text-sm text-slate-400">
                  ¿Qué datos necesitas? Describe tu requerimiento aquí.
                </p>
              </div>

              <div
                v-for="(msg, idx) in messages"
                :key="idx"
                class="flex flex-col"
                :class="msg.role === 'user' ? 'items-end' : 'items-start'"
              >
                <div
                  class="max-w-[90%] px-3 py-2 rounded-2xl text-xs shadow-sm"
                  :class="{
                    'bg-indigo-600 text-white rounded-br-md': msg.role === 'user',
                    'bg-white border border-slate-200 text-slate-700 rounded-bl-md': msg.role === 'ai',
                    'bg-amber-50 border border-amber-200 text-amber-800 rounded-bl-md': msg.role === 'system',
                    'bg-red-50 text-red-700 border border-red-200 rounded-bl-md': msg.role === 'error'
                  }"
                >
                  <p class="whitespace-pre-wrap">{{ msg.text }}</p>
                </div>
              </div>

              <div v-if="isProcessing" class="flex items-start gap-2">
                 <div class="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-3 py-2 shadow-sm">
                  <div class="flex items-center gap-1">
                    <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
                    <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
                    <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Chat Input -->
            <div class="p-3 bg-white border-t border-slate-100">
              <div class="relative">
                <textarea
                  v-model="currentQuestion"
                  @keydown.enter.exact.prevent="askAI"
                  placeholder="Escribe tu instrucción..."
                  class="w-full border border-slate-300 rounded-lg pl-3 pr-10 py-2 text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none transition"
                  rows="1"
                  :disabled="isProcessing"
                ></textarea>
                <button
                  @click="askAI"
                  :disabled="isProcessing || !currentQuestion.trim()"
                  class="absolute right-1.5 bottom-1.5 w-6 h-6 rounded bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- SQL VIEWER (Right, Collapsible) -->
          <div 
            class="border-l border-slate-200 bg-slate-900 flex flex-col transition-all duration-300 ease-in-out"
            :class="isSqlVisible ? 'w-1/3 min-w-[300px]' : 'w-10'"
          >
            <div class="flex items-center justify-between p-2 border-b border-slate-700 bg-slate-800">
              <span v-if="isSqlVisible" class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold pl-2">SQL Generado</span>
              <button 
                @click="isSqlVisible = !isSqlVisible"
                class="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700 transition"
                :title="isSqlVisible ? 'Ocultar SQL' : 'Mostrar SQL'"
              >
                <svg v-if="isSqlVisible" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
                </svg>
              </button>
            </div>

            <div v-if="isSqlVisible" class="flex-1 overflow-auto p-3 relative group">
              <button 
                v-if="sqlQuery"
                @click="copyToClipboard(sqlQuery)"
                class="absolute top-2 right-2 text-[10px] bg-slate-700 text-slate-300 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition hover:bg-slate-600"
              >
                Copiar
              </button>
              <code v-if="sqlQuery" class="text-[11px] text-green-400 font-mono block whitespace-pre-wrap break-all leading-relaxed">
                {{ sqlQuery }}
              </code>
              <div v-else class="h-full flex items-center justify-center text-slate-600 text-xs italic">
                Sin consulta generada
              </div>
            </div>
            <div v-else class="flex-1 flex flex-col items-center pt-4 gap-2">
               <span class="text-[10px] text-slate-500 font-mono writing-vertical-rl rotate-180 tracking-widest uppercase">SQL Viewer</span>
            </div>
          </div>

        </div>

        <!-- BOTTOM SECTION: CANVAS (ResultTable) -->
        <div class="flex-1 bg-slate-100 p-4 overflow-hidden flex flex-col min-w-0 relative">
          
          <div v-if="errorMsg" class="absolute top-2 left-1/2 transform -translate-x-1/2 z-10 bg-red-50 border border-red-200 rounded-lg px-4 py-2 shadow-lg flex items-center gap-2">
             <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
             <p class="text-xs text-red-700">{{ errorMsg }}</p>
             <button @click="errorMsg = ''" class="ml-2 text-red-400 hover:text-red-600">×</button>
          </div>

          <div class="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <ResultTable
              v-if="executionResult"
              :columns="executionResult.columns"
              :rows="executionResult.rows"
              :row-count="executionResult.row_count"
            />

            <div v-else class="h-full flex flex-col items-center justify-center text-slate-400 p-8">
              <div class="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                <svg class="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
              </div>
              <h3 class="text-sm font-medium text-slate-600 mb-1">El canvas está vacío</h3>
              <p class="text-xs text-slate-400 text-center max-w-xs">
                Usa el chat arriba para generar datos.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.writing-vertical-rl {
  writing-mode: vertical-rl;
}
</style>

