<script setup>
import { ref, onMounted, computed } from 'vue';
import { apiLocal } from '../api';

const props = defineProps({
  dashboard: { type: Object, required: true }
});

const emit = defineEmits(['close', 'save']);

const isLoading = ref(true);
const connections = ref([]);
const schemaData = ref({}); // Map: connectionKey -> schema structure
const cloudMap = ref({}); // Map: connectionKey -> { tableName: cloudId }

// State for selection
// Structure: { tableId: { mode: 'full'|'partial'|'default_only', columns: { colName: boolean } } }
const selectionState = ref({});

// Load initial data
onMounted(async () => {
  try {
    // 1. Load Connections
    const res = await apiLocal.get('/connections');
    const conns = Array.isArray(res) ? res : (res?.data || []);
    connections.value = conns;

    // 2. Load Drafts for each connection
    for (const conn of conns) {
      try {
        const draft = await apiLocal.get('/schema/draft', {
          params: { connection_key: conn.key }
        });

        if (draft.is_synced && draft.cloud_refs_json) {
          // Store Cloud Map
          cloudMap.value[conn.key] = JSON.parse(draft.cloud_refs_json);

          // Store Schema Structure
          if (draft.structure_json) {
            schemaData.value[conn.key] = JSON.parse(draft.structure_json);
          }
        }
      } catch (e) {
        console.warn(`Error loading draft for ${conn.key}`, e);
      }
    }

    // 3. Initialize Selection from Dashboard Context
    if (props.dashboard.context_definition) {
      try {
        const savedContext = typeof props.dashboard.context_definition === 'string' 
          ? JSON.parse(props.dashboard.context_definition) 
          : props.dashboard.context_definition;

        if (Array.isArray(savedContext)) {
          savedContext.forEach(item => {
            const colsMap = {};
            if (item.columns) {
              item.columns.forEach(c => colsMap[c] = true);
            }
            selectionState.value[item.table_id] = {
              mode: item.mode,
              columns: colsMap,
              selected: true
            };
          });
        }
      } catch (e) {
        console.error("Error parsing saved context", e);
      }
    }

  } catch (e) {
    console.error("Error loading context data", e);
  } finally {
    isLoading.value = false;
  }
});

// Helper to get table ID
const getTableId = (connKey, tableName) => {
  return cloudMap.value[connKey]?.[tableName];
};

// Toggle Table Selection
const toggleTable = (tableId, tableName) => {
  if (selectionState.value[tableId]?.selected) {
    // Deselect
    delete selectionState.value[tableId];
  } else {
    // Select with default mode
    selectionState.value[tableId] = {
      mode: 'default_only', // Default as per requirements ("Solo Campos Prioritarios" implies default/partial)
      columns: {},
      selected: true,
      tableName: tableName // Store for reference
    };
  }
};

// Change Mode
const setMode = (tableId, mode) => {
  if (!selectionState.value[tableId]) return;
  selectionState.value[tableId].mode = mode;
};

// Toggle Column
const toggleColumn = (tableId, colName) => {
  if (!selectionState.value[tableId]) return;
  
  const current = selectionState.value[tableId].columns[colName];
  if (current) {
    delete selectionState.value[tableId].columns[colName];
  } else {
    selectionState.value[tableId].columns[colName] = true;
  }

  // If we are selecting specific columns, ensure mode is partial
  if (Object.keys(selectionState.value[tableId].columns).length > 0) {
     // If user manually selects columns, we might want to switch to partial?
     // Or just let the user decide. The requirement says:
     // "Si selecciono una Tabla, por defecto selecciona 'Solo Campos Prioritarios' ... Debe permitir desplegar la tabla y marcar columnas específicas."
  }
};

const save = () => {
  const result = [];
  
  for (const [tableId, state] of Object.entries(selectionState.value)) {
    if (!state.selected) continue;

    const entry = {
      table_id: parseInt(tableId),
      table_name: state.tableName,
      mode: state.mode,
      columns: []
    };

    if (state.mode === 'partial') {
      entry.columns = Object.keys(state.columns);
    }

    result.push(entry);
  }

  emit('save', result);
};

// UI Helpers
const expandedTables = ref({});
const toggleExpand = (tableId) => {
  expandedTables.value[tableId] = !expandedTables.value[tableId];
};

const expandedConnections = ref({});
const toggleConnExpand = (connKey) => {
  expandedConnections.value[connKey] = !expandedConnections.value[connKey];
};

</script>

<template>
  <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-white w-full max-w-4xl max-h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
      
      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <div>
          <h2 class="text-lg font-bold text-slate-800">Configurar Contexto de Datos</h2>
          <p class="text-sm text-slate-500">Define qué tablas y columnas puede ver la IA en este dashboard.</p>
        </div>
        <button @click="$emit('close')" class="text-slate-400 hover:text-slate-600">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-6 bg-slate-50/50">
        
        <div v-if="isLoading" class="flex justify-center py-12">
          <svg class="w-8 h-8 text-indigo-600 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>

        <div v-else class="space-y-4">
          
          <div v-for="conn in connections" :key="conn.key" class="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <!-- Connection Header -->
            <button 
              @click="toggleConnExpand(conn.key)"
              class="w-full px-4 py-3 bg-slate-50 flex items-center justify-between hover:bg-slate-100 transition-colors"
            >
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                <span class="font-semibold text-slate-700">{{ conn.name }}</span>
                <span class="text-xs text-slate-400">({{ conn.type }})</span>
              </div>
              <svg 
                class="w-5 h-5 text-slate-400 transition-transform" 
                :class="expandedConnections[conn.key] ? 'rotate-180' : ''"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </button>

            <!-- Tables List -->
            <div v-show="expandedConnections[conn.key]" class="p-2 space-y-2">
              <div v-if="!schemaData[conn.key]" class="p-4 text-center text-sm text-slate-400 italic">
                No hay esquema sincronizado para esta conexión.
              </div>

              <div 
                v-for="table in schemaData[conn.key]" 
                :key="table.table"
                class="border border-slate-100 rounded-md transition-all"
                :class="selectionState[getTableId(conn.key, table.table)]?.selected ? 'bg-indigo-50/30 border-indigo-100' : 'bg-white'"
              >
                <!-- Table Row -->
                <div class="flex items-center p-3 gap-3">
                  <input 
                    type="checkbox" 
                    :checked="selectionState[getTableId(conn.key, table.table)]?.selected"
                    @change="toggleTable(getTableId(conn.key, table.table), table.table)"
                    class="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  
                  <div class="flex-1 cursor-pointer" @click="toggleExpand(getTableId(conn.key, table.table))">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-slate-700">{{ table.table }}</span>
                      <span v-if="table.desc" class="text-xs text-slate-400 truncate max-w-[200px]">{{ table.desc }}</span>
                    </div>
                  </div>

                  <!-- Mode Selector (Only if selected) -->
                  <div v-if="selectionState[getTableId(conn.key, table.table)]?.selected" class="flex items-center gap-2 bg-white rounded-lg border border-slate-200 p-1">
                    <button 
                      @click="setMode(getTableId(conn.key, table.table), 'default_only')"
                      class="px-2 py-1 text-xs rounded-md transition-colors"
                      :class="selectionState[getTableId(conn.key, table.table)].mode === 'default_only' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-500 hover:bg-slate-50'"
                      title="Solo columnas marcadas como importantes/default"
                    >
                      Prioritarios
                    </button>
                    <button 
                      @click="setMode(getTableId(conn.key, table.table), 'full')"
                      class="px-2 py-1 text-xs rounded-md transition-colors"
                      :class="selectionState[getTableId(conn.key, table.table)].mode === 'full' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-500 hover:bg-slate-50'"
                      title="Todas las columnas disponibles"
                    >
                      Todo
                    </button>
                    <button 
                      @click="setMode(getTableId(conn.key, table.table), 'partial')"
                      class="px-2 py-1 text-xs rounded-md transition-colors"
                      :class="selectionState[getTableId(conn.key, table.table)].mode === 'partial' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-500 hover:bg-slate-50'"
                      title="Selección manual de columnas"
                    >
                      Manual
                    </button>
                  </div>

                  <button 
                    @click="toggleExpand(getTableId(conn.key, table.table))"
                    class="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    <svg class="w-5 h-5 transform transition-transform" :class="expandedTables[getTableId(conn.key, table.table)] ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                  </button>
                </div>

                <!-- Columns List (Expandable) -->
                <div 
                  v-if="expandedTables[getTableId(conn.key, table.table)]" 
                  class="border-t border-slate-100 bg-slate-50/50 p-3 pl-11 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2"
                >
                  <label 
                    v-for="col in table.column_metadata" 
                    :key="col.col"
                    class="flex items-start gap-2 p-2 rounded hover:bg-white hover:shadow-sm transition-all cursor-pointer"
                  >
                    <input 
                      type="checkbox"
                      :disabled="selectionState[getTableId(conn.key, table.table)]?.mode !== 'partial'"
                      :checked="
                        selectionState[getTableId(conn.key, table.table)]?.mode === 'full' || 
                        (selectionState[getTableId(conn.key, table.table)]?.mode === 'default_only' && col.is_default) ||
                        (selectionState[getTableId(conn.key, table.table)]?.mode === 'partial' && selectionState[getTableId(conn.key, table.table)]?.columns[col.col])
                      "
                      @change="toggleColumn(getTableId(conn.key, table.table), col.col)"
                      class="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                    />
                    <div class="flex flex-col min-w-0">
                      <span class="text-xs font-medium text-slate-700 truncate" :title="col.col">{{ col.col }}</span>
                      <span class="text-[10px] text-slate-400 truncate" :title="col.desc || col.alias">{{ col.alias || col.desc || '-' }}</span>
                    </div>
                    <span v-if="col.is_default" class="ml-auto text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Def</span>
                  </label>
                </div>

              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-slate-200 bg-white flex justify-end gap-3">
        <button 
          @click="$emit('close')"
          class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
        >
          Cancelar
        </button>
        <button 
          @click="save"
          class="px-5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm hover:shadow transition-all"
        >
          Guardar Configuración
        </button>
      </div>

    </div>
  </div>
</template>
