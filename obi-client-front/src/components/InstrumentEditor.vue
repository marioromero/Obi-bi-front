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
// Reemplaza la función askAI completa:

const askAI = async () => {
  console.log("🔍 Contexto actual:", JSON.parse(JSON.stringify(parsedContext.value)));
  if (!currentQuestion.value.trim()) return;

  if (parsedContext.value.length === 0) {
    alert('No hay tablas configuradas en este dashboard. Configura el contexto primero.');
    return;
  }

  // 1. VALIDACIÓN DE CONSISTENCIA
  // Detectamos tablas que no tienen un ID numérico válido (ej. IDs temporales o nulos)
  const invalidTables = parsedContext.value.filter(item => {
    const tableId = item.table_id;
    // Debe ser un número válido y positivo
    const numericId = Number(tableId);
    return !tableId || !Number.isInteger(numericId) || numericId <= 0;
  });

  // Si hay tablas inválidas, DETENEMOS el proceso y avisamos al usuario.
  if (invalidTables.length > 0) {
    const tableNames = invalidTables.map(t => t.table_name || 'Desconocida').join(', ');
    
    // Categorizar tipos de problemas
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

    currentQuestion.value = ''; // Limpiamos input pero no procesamos
    return;
  }

  // Si llegamos aquí, todo es válido
  const q = currentQuestion.value;
  currentQuestion.value = '';
  messages.value.push({ role: 'user', text: q });

  isProcessing.value = true;
  errorMsg.value = '';

  try {
    // Transformar Contexto (Ya sabemos que todos tienen ID numérico)
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
      <header class="h-16 border-b border-slate-200 flex items-center justify-between px-6 bg-gradient-to-r from-slate-50 to-white flex-shrink-0">
        <div class="flex items-center gap-4">
          <button 
            @click="$emit('close')" 
            class="w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-all"
            title="Cerrar editor"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
          
          <div class="flex flex-col">
            <input
              v-model="reportName"
              class="font-bold text-slate-800 text-xl bg-transparent border-none focus:ring-0 placeholder-slate-300 p-0"
              placeholder="Nombre del Instrumento..."
            />
            <span class="text-xs text-slate-400">
              {{ initialReport ? 'Editando instrumento' : 'Nuevo instrumento' }} • Dashboard #{{ dashboardId }}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <!-- Context Summary Badge -->
          <div class="px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2">
            <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
            <span class="text-xs font-medium text-slate-600">Contexto: {{ contextSummary }}</span>
          </div>

          <button
            @click="saveInstrument"
            :disabled="!sqlQuery || isProcessing"
            class="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
          >
            <svg v-if="isProcessing" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            {{ initialReport ? 'Guardar Cambios' : 'Crear Instrumento' }}
          </button>
        </div>
      </header>

      <!-- MAIN WORKSPACE -->
      <div class="flex-1 flex overflow-hidden">

        <!-- PANEL CENTRAL: CANVAS (RESULTADOS) -->
        <div class="flex-1 bg-slate-100 p-6 overflow-hidden flex flex-col min-w-0">
          <div class="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            
            <ResultTable
              v-if="executionResult"
              :columns="executionResult.columns"
              :rows="executionResult.rows"
              :row-count="executionResult.row_count"
            />

            <div v-else class="h-full flex flex-col items-center justify-center text-slate-400 p-8">
              <div class="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center mb-6">
                <svg class="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
              </div>
              <h3 class="text-lg font-medium text-slate-600 mb-2">El canvas está vacío</h3>
              <p class="text-sm text-slate-400 text-center max-w-md">
                Usa el chat de la derecha para describir qué datos necesitas. 
                La IA generará la consulta y mostrará los resultados aquí.
              </p>
              <div class="mt-6 flex items-center gap-2 text-xs text-slate-400">
                <span class="px-2 py-1 bg-slate-100 rounded">Ejemplo:</span>
                <span class="italic">"Muéstrame las ventas del último mes"</span>
              </div>
            </div>
          </div>

          <div v-if="sqlQuery" class="mt-3 bg-slate-800 rounded-lg p-3 shadow-inner">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">SQL Generado</span>
              <button 
                @click="copyToClipboard(sqlQuery)"
                class="text-[10px] text-slate-400 hover:text-slate-200 transition"
              >
                Copiar
              </button>
            </div>
            <code class="text-xs text-green-400 font-mono block whitespace-pre-wrap break-all">
              {{ sqlQuery }}
            </code>
          </div>

          <div v-if="errorMsg" class="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
            <p class="text-sm text-red-700">{{ errorMsg }}</p>
          </div>
        </div>

        <!-- PANEL DERECHO: CHAT -->
        <div class="w-[400px] bg-white border-l border-slate-200 flex flex-col flex-shrink-0">
          
          <div class="p-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-purple-50">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                </svg>
              </div>
              <div>
                <h3 class="font-semibold text-slate-800">Asistente BI</h3>
                <p class="text-xs text-slate-500">Describe qué datos necesitas</p>
              </div>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            
            <div v-if="messages.length === 0" class="text-center py-8">
              <div class="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                </svg>
              </div>
              <h4 class="font-medium text-slate-700 mb-2">¡Hola! Soy tu analista de datos</h4>
              <p class="text-sm text-slate-500 mb-4">
                Pídeme reportes, filtros o análisis en lenguaje natural.
              </p>
              <div class="space-y-2 text-left max-w-xs mx-auto">
                <p class="text-xs text-slate-400 font-medium mb-2">Ejemplos:</p>
                <button 
                  @click="currentQuestion = 'Muéstrame el top 10 de productos más vendidos'"
                  class="w-full text-left text-xs bg-white border border-slate-200 rounded-lg p-2 hover:border-indigo-300 hover:bg-indigo-50 transition"
                >
                  "Muéstrame el top 10 de productos más vendidos"
                </button>
                <button 
                  @click="currentQuestion = 'Total de ventas agrupado por mes'"
                  class="w-full text-left text-xs bg-white border border-slate-200 rounded-lg p-2 hover:border-indigo-300 hover:bg-indigo-50 transition"
                >
                  "Total de ventas agrupado por mes"
                </button>
                <button 
                  @click="currentQuestion = 'Clientes que no han comprado en 30 días'"
                  class="w-full text-left text-xs bg-white border border-slate-200 rounded-lg p-2 hover:border-indigo-300 hover:bg-indigo-50 transition"
                >
                  "Clientes que no han comprado en 30 días"
                </button>
              </div>
            </div>

            <div
              v-for="(msg, idx) in messages"
              :key="idx"
              class="flex flex-col"
              :class="msg.role === 'user' ? 'items-end' : 'items-start'"
            >
              <div
                class="max-w-[85%] p-3 rounded-2xl text-sm shadow-sm"
                :class="{
                  'bg-indigo-600 text-white rounded-br-md': msg.role === 'user',
                  'bg-white border border-slate-200 text-slate-700 rounded-bl-md': msg.role === 'ai',
                  'bg-amber-50 border border-amber-200 text-amber-800 rounded-bl-md': msg.role === 'system',
                  'bg-red-50 text-red-700 border border-red-200 rounded-bl-md': msg.role === 'error'
                }"
              >
                <p class="whitespace-pre-wrap">{{ msg.text }}</p>
              </div>
              <span class="text-[10px] text-slate-400 mt-1 px-1">
                {{ msg.role === 'user' ? 'Tú' : msg.role === 'ai' ? 'Asistente' : msg.role === 'system' ? 'Sistema' : 'Error' }}
              </span>
            </div>

            <div v-if="isProcessing" class="flex items-start gap-2">
              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                <svg class="w-4 h-4 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                </svg>
              </div>
              <div class="bg-white border border-slate-200 rounded-2xl rounded-bl-md p-3 shadow-sm">
                <div class="flex items-center gap-1">
                  <span class="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
                  <span class="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
                  <span class="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
                </div>
              </div>
            </div>
          </div>

          <div class="p-4 bg-white border-t border-slate-200">
            <div class="relative">
              <textarea
                v-model="currentQuestion"
                @keydown.enter.exact.prevent="askAI"
                placeholder="Escribe tu instrucción..."
                class="w-full border border-slate-300 rounded-xl pl-4 pr-12 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none transition"
                rows="2"
                :disabled="isProcessing"
              ></textarea>
              <button
                @click="askAI"
                :disabled="isProcessing || !currentQuestion.trim()"
                class="absolute right-3 bottom-3 w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                </svg>
              </button>
            </div>
            <div class="flex items-center justify-between mt-2">
              <p class="text-[10px] text-slate-400">
                Enter para enviar • Shift+Enter para nueva línea
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>
