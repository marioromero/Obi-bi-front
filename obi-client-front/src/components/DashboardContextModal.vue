<script setup>
import {ref, onMounted, computed} from 'vue';
import {apiLocal} from '../api';

// Función para obtener el nombre real de la tabla, sin importar cómo venga del back
const getTableName = (t) => {
  return t.table || t.name || t.table_name || 'unknown';
};

const props = defineProps({
  dashboard: {type: Object, required: true}
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
    // 1. Cargar Conexiones
    const res = await apiLocal.get('/connections');
    const conns = Array.isArray(res) ? res : (res?.data || []);
    connections.value = conns;

    // 2. Cargar Esquemas/Borradores
    for (const conn of conns) {
      try {
        const draft = await apiLocal.get('/schema/draft', { params: { connection_key: conn.key } });

        if (draft.is_synced && draft.cloud_refs_json) {
          cloudMap.value[conn.key] = JSON.parse(draft.cloud_refs_json);

          if (draft.structure_json) {
            schemaData.value[conn.key] = JSON.parse(draft.structure_json);
          }
        }
      } catch (e) {
        console.warn(`Error loading draft for ${conn.key}`, e);
      }
    }

    // 3. Inicializar Selección (Con recuperación de nombres)
    if (props.dashboard.context_definition) {
      try {
        console.log('🔍 LOAD DEBUG: dashboard.context_definition raw:', props.dashboard.context_definition);
        
        const savedContext = typeof props.dashboard.context_definition === 'string'
          ? JSON.parse(props.dashboard.context_definition)
          : props.dashboard.context_definition;

        console.log('🔍 LOAD DEBUG: savedContext parsed:', savedContext);
        console.log('🔍 LOAD DEBUG: savedContext type:', typeof savedContext);
        console.log('🔍 LOAD DEBUG: savedContext is array:', Array.isArray(savedContext));

        if (Array.isArray(savedContext)) {
          console.log('🔍 LOAD DEBUG: Entrando al bucle de carga, length:', savedContext.length);
          
          for (let i = 0; i < savedContext.length; i++) {
            const item = savedContext[i];
            console.log(`🔍 LOAD DEBUG: Procesando elemento ${i}:`, item);
            console.log(`🔍 LOAD DEBUG: item.table_id = ${item.table_id}, typeof = ${typeof item.table_id}`);
            
            const colsMap = {};
            if (item.columns) item.columns.forEach(c => colsMap[c] = true);

            // VALIDACIÓN CRÍTICA: No procesar elementos con table_id inválido
            if (!item.table_id || item.table_id === null || item.table_id === undefined) {
              console.warn('Contexto inválido detectado: elemento sin table_id válido', item);
              console.warn('🔍 LOAD DEBUG: SALTANDO elemento con table_id inválido');
              continue; // Saltar este elemento
            }

            // INTENTO DE RECUPERAR EL NOMBRE:
            let resolvedTableName = item.table_name;
            console.log(`🔍 LOAD DEBUG: resolvedTableName inicial: ${resolvedTableName}`);

            // Si no tiene nombre, lo buscamos en los esquemas cargados usando el ID
            if (!resolvedTableName) {
               console.log('🔍 LOAD DEBUG: Buscando nombre por ID en esquema...');
               for (const [connKey, tables] of Object.entries(schemaData.value)) {
                 console.log(`🔍 LOAD DEBUG: Revisando connKey: ${connKey}`);
                 for (const t of tables) {
                   const tId = cloudMap.value[connKey]?.[getTableName(t)];
                   console.log(`🔍 LOAD DEBUG: tabla ${getTableName(t)} tiene tId=${tId}, buscando match con ${item.table_id}`);
                   // Comparación laxa (==) por si string vs number
                   if (tId == item.table_id) {
                     resolvedTableName = getTableName(t);
                     console.log(`🔍 LOAD DEBUG: MATCH encontrado! ${tId} == ${item.table_id} -> ${resolvedTableName}`);
                     break;
                   }
                 }
                 if (resolvedTableName) break;
               }
            }

            // Usar el table_id como key, pero verificar que sea válido
            const tableKey = String(item.table_id);
            console.log(`🔍 LOAD DEBUG: tableKey = "${tableKey}" (de ${item.table_id})`);
            
            if (tableKey === 'null' || tableKey === 'undefined' || tableKey === '') {
              console.warn('Contexto inválido detectado: table_id no se puede convertir a string válido', item);
              console.warn('🔍 LOAD DEBUG: SALTANDO tablaKey inválido');
              continue; // Saltar este elemento
            }

            console.log(`🔍 LOAD DEBUG: Agregando a selectionState[${tableKey}]:`, {
              mode: item.mode,
              columns: colsMap,
              selected: true,
              tableName: resolvedTableName || 'Tabla Desconocida'
            });

            selectionState.value[tableKey] = {
              mode: item.mode,
              columns: colsMap,
              selected: true,
              tableName: resolvedTableName || 'Tabla Desconocida'
            };
          }
          
          console.log('🔍 LOAD DEBUG: selectionState final:', JSON.parse(JSON.stringify(selectionState.value)));
        }
      } catch (e) {
        console.error("Error parsing saved context", e);
      }
    } else {
      console.log('🔍 LOAD DEBUG: No hay context_definition en dashboard');
    }
  } catch (e) {
    console.error("Error loading context data", e);
  } finally {
    isLoading.value = false;
  }
});

// Helper to get table ID
const getTableId = (connKey, tableName) => {
  const cloudId = cloudMap.value[connKey]?.[tableName];

  // Si tenemos el ID oficial de la nube, lo usamos.
  if (cloudId) return cloudId;

  // FALLBACK: Si no hay ID, creamos una clave única para que el UI no falle.
  // Usamos un separador que no suela estar en nombres de tablas
  return `temp_${connKey}_${tableName}`;
};

// Toggle Table Selection
const toggleTable = (tableId, tableName) => {
  console.log(`🔍 TOGGLE DEBUG: toggleTable llamado con tableId="${tableId}", tableName="${tableName}"`);
  console.log(`🔍 TOGGLE DEBUG: tableId typeof: ${typeof tableId}, parseInt(tableId): ${parseInt(tableId)}`);
  console.log(`🔍 TOGGLE DEBUG: tableId es null/undefined: ${tableId === null}, ${tableId === undefined}`);
  
  if (selectionState.value[tableId]?.selected) {
    console.log(`🔍 TOGGLE DEBUG: Deseleccionando tabla ${tableId}`);
    // Deselect
    delete selectionState.value[tableId];
  } else {
    console.log(`🔍 TOGGLE DEBUG: Seleccionando tabla ${tableId} - ${tableName}`);
    // Select with default mode
    selectionState.value[tableId] = {
      mode: 'default_only', // Default as per requirements ("Solo Campos Prioritarios" implies default/partial)
      columns: {},
      selected: true,
      tableName: tableName // Store for reference
    };
    
    console.log(`🔍 TOGGLE DEBUG: Estado después de selección:`, JSON.parse(JSON.stringify(selectionState.value[tableId])));
  }
  
  console.log(`🔍 TOGGLE DEBUG: selectionState completo después del toggle:`, JSON.parse(JSON.stringify(selectionState.value)));
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
  const invalidTables = []; // Para debugging
  
  console.log('🔍 SAVE DEBUG: selectionState actual:', JSON.parse(JSON.stringify(selectionState.value)));
  console.log('🔍 SAVE DEBUG: Entrando al bucle de guardado...');

  for (const [key, state] of Object.entries(selectionState.value)) {
    if (!state.selected) {
      console.log(`🔍 SAVE DEBUG: Tabla ${key} no seleccionada, saltando...`);
      continue;
    }

    console.log(`🔍 SAVE DEBUG: Procesando tabla ${key} - ${state.tableName}`);

    // Obtener el ID real de la tabla
    let finalId = parseInt(key);
    console.log(`🔍 SAVE DEBUG: key=${key}, finalId=${finalId}, typeof finalId=${typeof finalId}`);
    
    // Si no es un número válido después del parse, es que probablemente
    // se está usando un ID temporal que no se debería guardar
    if (isNaN(finalId) || !finalId) {
      console.log(`🔍 SAVE DEBUG: ID inválido detectado: ${key} -> ${finalId}`);
      // Verificamos si es un ID temporal
      if (key.startsWith('temp_')) {
        console.warn(`Tabla descartada por ID temporal: ${state.tableName} (ID: ${key})`);
        invalidTables.push({ name: state.tableName, reason: 'ID temporal' });
        continue;
      } else {
        // Si no es temporal pero tampoco es un número válido, lo descartamos
        console.warn(`Tabla descartada por ID inválido: ${state.tableName} (ID: ${key})`);
        invalidTables.push({ name: state.tableName, reason: 'ID inválido' });
        continue;
      }
    }
    
    // Si llegamos aquí, tenemos un ID numérico válido
    const entry = {
      table_id: finalId,
      table_name: state.tableName || 'Sin Nombre',
      mode: state.mode,
      columns: []
    };

    if (state.mode === 'partial') {
      entry.columns = Object.keys(state.columns);
    }

    console.log(`🔍 SAVE DEBUG: Agregando entrada válida:`, entry);
    result.push(entry);
  }

  console.log('🔍 SAVE DEBUG: Resultado final antes de emit:', result);
  console.log('🔍 SAVE DEBUG: invalidTables:', invalidTables);

  // Si hay tablas inválidas, avisamos al usuario
  if (invalidTables.length > 0) {
    const warningMsg = `Se descartaron ${invalidTables.length} tabla(s) que no están sincronizadas con la nube: ` +
                      invalidTables.map(t => t.name).join(', ') +
                      '. Sincroniza el esquema en "Configurar Contexto" primero.';
    alert(warningMsg);
  }

  // Solo guardamos si tenemos al menos una tabla válida
  if (result.length === 0) {
    alert('No se puede guardar el contexto: todas las tablas seleccionadas no están sincronizadas con la nube.');
    return;
  }

  console.log('Contexto guardado con', result.length, 'tablas válidas');
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

      <div class="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <div>
          <h2 class="text-lg font-bold text-slate-800">Configurar Contexto de Datos</h2>
          <p class="text-sm text-slate-500">Define qué tablas y columnas puede ver la IA en este dashboard.</p>
        </div>
        <button @click="$emit('close')" class="text-slate-400 hover:text-slate-600">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-6 bg-slate-50/50">

        <div v-if="isLoading" class="flex justify-center py-12">
          <svg class="w-8 h-8 text-indigo-600 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>

        <div v-else class="space-y-4">

          <div v-for="conn in connections" :key="conn.key" class="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <button
              @click="toggleConnExpand(conn.key)"
              class="w-full px-4 py-3 bg-slate-50 flex items-center justify-between hover:bg-slate-100 transition-colors"
            >
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                <span class="font-semibold text-slate-700">
                  {{ conn.name || conn.connection_name || conn.alias || conn.database || conn.key }}
                </span>
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

            <div v-show="expandedConnections[conn.key]" class="p-2 space-y-2">
              <div v-if="!schemaData[conn.key]" class="p-4 text-center text-sm text-slate-400 italic">
                No hay esquema sincronizado para esta conexión.
              </div>

              <div
                v-for="table in schemaData[conn.key]"
                :key="getTableName(table)"
                class="border border-slate-100 rounded-md transition-all"
                :class="selectionState[getTableId(conn.key, getTableName(table))]?.selected ? 'bg-indigo-50/30 border-indigo-100' : 'bg-white'"
              >
                <div class="flex items-center p-3 gap-3">
                  <input
                    type="checkbox"
                    :checked="selectionState[getTableId(conn.key, getTableName(table))]?.selected"
                    @change="toggleTable(getTableId(conn.key, getTableName(table)), getTableName(table))"
                    class="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />

                  <div class="flex-1 cursor-pointer" @click="toggleExpand(getTableId(conn.key, getTableName(table)))">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-slate-700">{{ getTableName(table) }}</span>
                      <span v-if="table.desc" class="text-xs text-slate-400 truncate max-w-[200px]">{{ table.desc }}</span>
                    </div>
                  </div>

                  <div v-if="selectionState[getTableId(conn.key, getTableName(table))]?.selected" class="flex items-center gap-2 bg-white rounded-lg border border-slate-200 p-1">
                    <button
                      @click="setMode(getTableId(conn.key, getTableName(table)), 'default_only')"
                      class="px-2 py-1 text-xs rounded-md transition-colors"
                      :class="selectionState[getTableId(conn.key, getTableName(table))].mode === 'default_only' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-500 hover:bg-slate-50'"
                      title="Solo columnas marcadas como importantes/default"
                    >
                      Prioritarios
                    </button>
                    <button
                      @click="setMode(getTableId(conn.key, getTableName(table)), 'full')"
                      class="px-2 py-1 text-xs rounded-md transition-colors"
                      :class="selectionState[getTableId(conn.key, getTableName(table))].mode === 'full' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-500 hover:bg-slate-50'"
                      title="Todas las columnas disponibles"
                    >
                      Todo
                    </button>
                    <button
                      @click="setMode(getTableId(conn.key, getTableName(table)), 'partial')"
                      class="px-2 py-1 text-xs rounded-md transition-colors"
                      :class="selectionState[getTableId(conn.key, getTableName(table))].mode === 'partial' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-500 hover:bg-slate-50'"
                      title="Selección manual de columnas"
                    >
                      Manual
                    </button>
                  </div>

                  <button
                    @click="toggleExpand(getTableId(conn.key, getTableName(table)))"
                    class="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    <svg class="w-5 h-5 transform transition-transform" :class="expandedTables[getTableId(conn.key, getTableName(table))] ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                  </button>
                </div>

                <div
                  v-if="expandedTables[getTableId(conn.key, getTableName(table))]"
                  class="border-t border-slate-100 bg-slate-50/50 p-3 pl-11 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2"
                >
                  <label
                    v-for="col in table.column_metadata"
                    :key="col.col"
                    class="flex items-start gap-2 p-2 rounded hover:bg-white hover:shadow-sm transition-all cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      :disabled="selectionState[getTableId(conn.key, getTableName(table))]?.mode !== 'partial'"
                      :checked="
                        selectionState[getTableId(conn.key, getTableName(table))]?.mode === 'full' ||
                        (selectionState[getTableId(conn.key, getTableName(table))]?.mode === 'default_only' && col.is_default) ||
                        (selectionState[getTableId(conn.key, getTableName(table))]?.mode === 'partial' && selectionState[getTableId(conn.key, getTableName(table))]?.columns[col.col])
                      "
                      @change="toggleColumn(getTableId(conn.key, getTableName(table)), col.col)"
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
