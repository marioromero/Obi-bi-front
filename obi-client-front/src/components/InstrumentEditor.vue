<script setup>
import { ref, onMounted, computed } from 'vue';
import { apiLocal, apiCloud, sessionState } from '../api';
import ResultTable from './ResultTable.vue';

const props = defineProps({
  dashboardId: { type: Number, required: true },
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

// --- ESTADO DEL CONTEXTO ---
const cloudMap = ref({});
const selectedTableIds = ref([]);
const showContextPanel = ref(false);

// --- COMPUTED ---
const selectedCount = computed(() => selectedTableIds.value.length);
const totalTables = computed(() => Object.keys(cloudMap.value).length);
const hasContext = computed(() => selectedTableIds.value.length > 0);

// --- CARGA INICIAL ---
onMounted(async () => {
  await loadContext();

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
    if (totalTables.value > 0) {
      showContextPanel.value = true;
    }
  }
});

// Almacenar la información completa del esquema para cada conexión
const schemaData = ref({});
const connections = ref([]);

const loadContext = async () => {
  try {
    const conns = await apiLocal.get('/connections');
    connections.value = conns;
    let allRefs = {};
    let allSchemaData = {};

    for (const conn of conns) {
      try {
        const draft = await apiLocal.get('/schema/draft', {
          params: { connection_key: conn.key }
        });
        
        if (draft.is_synced && draft.cloud_refs_json) {
          const refs = JSON.parse(draft.cloud_refs_json);
          for (const [tableName, cloudId] of Object.entries(refs)) {
            allRefs[cloudId] = tableName;
          }
          
          // Almacenar la información del esquema para esta conexión
          if (draft.structure_json) {
            allSchemaData[conn.key] = JSON.parse(draft.structure_json);
          }
        }
      } catch (e) {
        console.warn(`Error cargando draft para ${conn.key}:`, e);
        continue;
      }
    }
    
    cloudMap.value = allRefs;
    selectedTableIds.value = Object.keys(allRefs).map(id => parseInt(id));
    schemaData.value = allSchemaData;
    
  } catch (e) {
    console.error("Error cargando contexto:", e);
    errorMsg.value = "No se pudo cargar el contexto de tablas.";
  }
};

// Agrupar tablas por conexión
const tablesByConnection = computed(() => {
  const grouped = {};
  
  // Crear un mapa de tableId a connectionKey
  const tableToConnMap = {};
  for (const conn of connections.value) {
    try {
      const draft = schemaData.value[conn.key];
      if (draft) {
        // Encontrar el cloud_refs_json para esta conexión
        // Necesitamos encontrar la conexión en conns para obtener cloud_refs_json
        const connWithRefs = connections.value.find(c => c.key === conn.key);
        if (connWithRefs && connWithRefs.cloud_refs_json) {
          const refs = JSON.parse(connWithRefs.cloud_refs_json);
          for (const [tableName, cloudId] of Object.entries(refs)) {
            tableToConnMap[cloudId] = {
              connKey: conn.key,
              tableName: tableName
            };
          }
        }
      }
    } catch (e) {
      console.warn(`Error procesando conexión ${conn.key}:`, e);
      continue;
    }
  }
  
  // Agrupar las tablas por conexión
  for (const [tableId, tableName] of Object.entries(cloudMap.value)) {
    const tableInfo = tableToConnMap[tableId];
    const connKey = tableInfo ? tableInfo.connKey : 'default';
    const fullTableName = tableInfo ? tableInfo.tableName : tableName;
    
    // Parsear el nombre de la tabla para obtener solo el nombre de la tabla sin la conexión
    const parts = fullTableName.split('.');
    const tableDisplayName = parts.length > 1 ? parts.slice(1).join('.') : fullTableName;
    
    if (!grouped[connKey]) {
      grouped[connKey] = {};
    }
    
    grouped[connKey][tableId] = {
      name: tableDisplayName,
      fullName: fullTableName
    };
  }
  
  return grouped;
});

const toggleTable = (tableId) => {
  const id = parseInt(tableId);
  const idx = selectedTableIds.value.indexOf(id);
  if (idx > -1) {
    selectedTableIds.value.splice(idx, 1);
  } else {
    selectedTableIds.value.push(id);
  }
};

const toggleAllTables = () => {
  if (selectedTableIds.value.length === Object.keys(cloudMap.value).length) {
    selectedTableIds.value = [];
  } else {
    selectedTableIds.value = Object.keys(cloudMap.value).map(id => parseInt(id));
  }
};

const isTableSelected = (tableId) => {
  return selectedTableIds.value.includes(parseInt(tableId));
};

// --- LÓGICA CHAT IA ---
// Función para determinar columnas relevantes según la pregunta del usuario
const getRelevantColumns = (question, tableSchema) => {
  // Convertir la pregunta a minúsculas para hacer la comparación insensible a mayúsculas
  const lowerQuestion = question.toLowerCase();
  
  // Lista para almacenar las columnas relevantes
  const relevantColumns = [];
  
  // Recorrer las columnas de la tabla
  for (const column of tableSchema.column_metadata) {
    // Si la columna está marcada como predeterminada, siempre se incluye
    if (column.is_default) {
      relevantColumns.push(column.col);
      continue;
    }
    
    // Verificar si el nombre de la columna o su descripción aparecen en la pregunta
    if (lowerQuestion.includes(column.col.toLowerCase()) ||
        (column.desc && lowerQuestion.includes(column.desc.toLowerCase()))) {
      relevantColumns.push(column.col);
      continue;
    }
    
    // Verificar si alguna palabra clave de las instrucciones aparece en la pregunta
    if (column.instructions) {
      const lowerInstructions = column.instructions.toLowerCase();
      const words = lowerInstructions.split(/\s+/);
      if (words.some(word => lowerQuestion.includes(word))) {
        relevantColumns.push(column.col);
        continue;
      }
    }
  }
  
  return relevantColumns;
};

const askAI = async () => {
  if (!currentQuestion.value.trim()) return;

  if (selectedTableIds.value.length === 0) {
    alert('Debes seleccionar al menos una tabla como contexto para la IA.');
    showContextPanel.value = true;
    return;
  }

  const q = currentQuestion.value;
  currentQuestion.value = '';
  messages.value.push({ role: 'user', text: q });

  isProcessing.value = true;
  errorMsg.value = '';

  try {
    // Construir schema_config optimizado
    const schemaConfig = [];
    
    // Obtener las conexiones para mapear table_id a connection_key
    const conns = await apiLocal.get('/connections');
    const tableToConnMap = {};
    
    for (const conn of conns) {
      try {
        const draft = await apiLocal.get('/schema/draft', {
          params: { connection_key: conn.key }
        });
        
        if (draft.is_synced && draft.cloud_refs_json) {
          const refs = JSON.parse(draft.cloud_refs_json);
          for (const [tableName, cloudId] of Object.entries(refs)) {
            tableToConnMap[cloudId] = conn.key;
          }
        }
      } catch (e) {
        console.warn(`Error cargando draft para ${conn.key}:`, e);
        continue;
      }
    }
    
    // Para cada tabla seleccionada, determinar las columnas relevantes
    for (const tableId of selectedTableIds.value) {
      const tableIdStr = tableId.toString();
      const connKey = tableToConnMap[tableIdStr];
      
      if (connKey && schemaData.value[connKey]) {
        // Encontrar la tabla en el esquema
        const tableSchema = schemaData.value[connKey].find(table => {
          // Usar cloud_refs_json para mapear tableName a cloudId
          const draft = conns.find(c => c.key === connKey);
          if (draft) {
            try {
              const refs = JSON.parse(draft.cloud_refs_json || '{}');
              return Object.values(refs).includes(parseInt(tableIdStr));
            } catch (e) {
              return false;
            }
          }
          return false;
        });
        
        if (tableSchema) {
          // Obtener columnas relevantes para esta tabla
          const relevantColumns = getRelevantColumns(q, tableSchema);
          
          // Añadir al schema_config
          schemaConfig.push({
            table_id: tableId,
            use_full_schema: false,
            include_columns: relevantColumns
          });
        } else {
          // Si no se encuentra la tabla, enviar configuración vacía
          schemaConfig.push({
            table_id: tableId,
            use_full_schema: false,
            include_columns: []
          });
        }
      } else {
        // Si no hay datos de esquema, enviar configuración vacía
        schemaConfig.push({
          table_id: tableId,
          use_full_schema: false,
          include_columns: []
        });
      }
    }
    
    const payload = {
      question: q,
      schema_table_ids: selectedTableIds.value,
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
    messages.value.push({ role: 'error', text: 'Error: ' + txt });
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
          <button
            @click="showContextPanel = !showContextPanel"
            class="flex items-center gap-2 px-4 py-2 rounded-lg border transition-all"
            :class="showContextPanel 
              ? 'bg-indigo-50 border-indigo-300 text-indigo-700' 
              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
            </svg>
            <span class="text-sm font-medium">Contexto</span>
            <span 
              class="px-2 py-0.5 rounded-full text-xs font-bold"
              :class="hasContext ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
            >
              {{ selectedCount }}/{{ totalTables }}
            </span>
          </button>

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

        <!-- PANEL IZQUIERDO: CONTEXTO (Toggleable) -->
        <transition name="slide">
          <div 
            v-if="showContextPanel" 
            class="w-72 bg-slate-50 border-r border-slate-200 flex flex-col flex-shrink-0"
          >
            <div class="p-4 border-b border-slate-200 bg-white">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-slate-700 text-sm">Tablas Disponibles</h3>
                <button 
                  @click="showContextPanel = false"
                  class="text-slate-400 hover:text-slate-600"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <p class="text-xs text-slate-500 mb-3">
                Selecciona las tablas que la IA puede usar para generar consultas.
              </p>
              <button
                @click="toggleAllTables"
                class="w-full text-xs text-indigo-600 hover:text-indigo-800 font-medium py-1"
              >
                {{ selectedCount === totalTables ? 'Deseleccionar todas' : 'Seleccionar todas' }}
              </button>
            </div>

            <div class="flex-1 overflow-y-auto p-3 space-y-1">
              <div v-if="totalTables === 0" class="text-center py-8">
                <svg class="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
                </svg>
                <p class="text-sm text-slate-400">No hay tablas sincronizadas</p>
                <p class="text-xs text-slate-400 mt-1">Sincroniza tu esquema primero</p>
              </div>

              <!-- Mostrar las conexiones y sus tablas -->
              <div v-for="(connTables, connKey) in tablesByConnection" :key="connKey" class="mb-4">
                <div class="px-2 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wide bg-slate-100 rounded mb-1">
                  {{ connKey }}
                </div>
                <label
                  v-for="(tableInfo, tableId) in connTables"
                  :key="tableId"
                  class="flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ml-2"
                  :class="isTableSelected(tableId)
                    ? 'bg-indigo-50 border border-indigo-200'
                    : 'bg-white border border-slate-100 hover:border-slate-200'"
                >
                  <input
                    type="checkbox"
                    :checked="isTableSelected(tableId)"
                    @change="toggleTable(tableId)"
                    class="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div class="flex-1 min-w-0">
                    <span class="text-sm font-medium text-slate-700 block">
                      {{ tableInfo.name }}
                    </span>
                  </div>
                  <svg
                    v-if="isTableSelected(tableId)"
                    class="w-4 h-4 text-indigo-500 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                  </svg>
                </label>
              </div>
            </div>

            <div class="p-3 border-t border-slate-200 bg-white">
              <div 
                class="text-xs p-2 rounded-lg"
                :class="hasContext ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'"
              >
                <span v-if="hasContext">
                  ✓ {{ selectedCount }} tabla(s) seleccionada(s)
                </span>
                <span v-else>
                  ⚠ Selecciona al menos una tabla
                </span>
              </div>
            </div>
          </div>
        </transition>

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
              <p class="text-[10px] text-slate-400">
                Contexto: <span :class="hasContext ? 'text-green-600' : 'text-red-500'">{{ selectedCount }} tablas</span>
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-enter-to,
.slide-leave-from {
  transform: translateX(0);
  opacity: 1;
}
</style>
