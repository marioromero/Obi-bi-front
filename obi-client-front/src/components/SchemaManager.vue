<script setup>
import { ref, onMounted } from 'vue';
import { apiLocal as api } from '../api'; // Usamos la API Local

// --- ESTADO ---
const connections = ref([]);
const activeConnection = ref(null);
const currentDraft = ref(null);
const selectedTable = ref(null); // La tabla que estamos editando actualmente

// Estados de UI
const isLoading = ref(false);
const isScanning = ref(false);
const isSaving = ref(false);
const isPublishing = ref(false);
const errorMsg = ref('');
const successMsg = ref('');
const showDebug = ref(false);

// --- ACCIONES PRINCIPALES ---

// 1. Cargar Conexiones
const loadConnections = async () => {
  try {
    connections.value = await api.get('/connections');
  } catch (e) {
    errorMsg.value = "Error cargando conexiones: " + e.message;
  }
};

// 2. Seleccionar Conexión y Cargar Borrador
const selectConnection = async (conn) => {
  activeConnection.value = conn;
  currentDraft.value = null;
  selectedTable.value = null;
  errorMsg.value = '';
  successMsg.value = '';
  isLoading.value = true;

  try {
    const res = await api.get('/schema/draft', { params: { connection_key: conn.key } });
    if (res && res.structure_json) {
      res.structure_parsed = JSON.parse(res.structure_json);
    }
    currentDraft.value = res;
  } catch (e) {
    if (e.response && e.response.status === 404) {
      currentDraft.value = null; // No existe borrador aún
    } else {
      errorMsg.value = "Error: " + e.message;
    }
  } finally {
    isLoading.value = false;
  }
};

// 3. Escanear (Crear Borrador)
const scanSchema = async () => {
  if (!activeConnection.value) return;
  isScanning.value = true;
  errorMsg.value = '';

  try {
    const res = await api.post('/schema/scan', { connection_key: activeConnection.value.key });
    if (res && res.structure_json) {
      res.structure_parsed = JSON.parse(res.structure_json);
    }
    currentDraft.value = res;
    successMsg.value = "Escaneo completado exitosamente.";
  } catch (e) {
    errorMsg.value = "Fallo al escanear: " + e.message;
  } finally {
    isScanning.value = false;
  }
};

// 4. Abrir Editor de Tabla
const openTableEditor = (table) => {
  selectedTable.value = table;
  // Limpiamos mensajes para no distraer
  successMsg.value = '';
};

// 5. Guardar Cambios (PUT)
const saveDraft = async () => {
  if (!currentDraft.value) return;
  isSaving.value = true;
  errorMsg.value = '';
  successMsg.value = '';

  try {
    // Re-empaquetamos el objeto JSON modificado a String
    const payload = {
      structure_json: JSON.stringify(currentDraft.value.structure_parsed)
    };

    await api.put('/schema/draft', payload, {
      params: { connection_key: activeConnection.value.key }
    });

    successMsg.value = "Cambios guardados localmente.";
    // Opcional: Cerrar el editor tras guardar
    // selectedTable.value = null;
  } catch (e) {
    errorMsg.value = "Error al guardar: " + e.message;
  } finally {
    isSaving.value = false;
  }
};

// 6. Publicar a la Nube (POST)
const publishSchema = async () => {
  if (!confirm("¿Estás seguro de enviar este esquema a la Nube? Esto actualizará la IA.")) return;

  isPublishing.value = true;
  errorMsg.value = '';

  try {
    await api.post('/schema/publish', { connection_key: activeConnection.value.key });
    successMsg.value = "¡Esquema publicado y sincronizado con la Nube exitosamente!";
    // Recargamos para actualizar el estado 'is_synced'
    await selectConnection(activeConnection.value);
  } catch (e) {
    errorMsg.value = "Error de publicación: " + e.message;
  } finally {
    isPublishing.value = false;
  }
};

onMounted(() => {
  loadConnections();
});
</script>

<template>
  <div class="flex h-[650px] border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm font-sans">

    <aside class="w-64 flex-shrink-0 bg-slate-50 border-r border-slate-200 overflow-y-auto">
      <div class="p-4 border-b border-slate-200 bg-slate-100">
        <h3 class="font-bold text-slate-700 text-xs uppercase tracking-wide">Mis Conexiones</h3>
      </div>
      <ul>
        <li v-for="conn in connections" :key="conn.key">
          <button
            @click="selectConnection(conn)"
            class="w-full text-left px-4 py-3 text-sm transition-all border-b border-slate-100 hover:bg-white"
            :class="activeConnection?.key === conn.key ? 'bg-white border-l-4 border-l-indigo-600 text-indigo-700 font-medium shadow-sm' : 'text-slate-600 border-l-4 border-l-transparent'"
          >
            <div class="flex justify-between items-center mb-1">
               <span class="truncate font-semibold">{{ conn.key }}</span>
               <span class="text-[10px] bg-slate-200 px-1.5 rounded text-slate-500 uppercase">{{ conn.type }}</span>
            </div>
            <span class="text-xs text-slate-400 truncate block">{{ conn.dbname }}</span>
          </button>
        </li>
      </ul>
    </aside>

    <main class="flex-1 flex flex-col min-w-0 relative bg-white">

      <div v-if="isLoading || isScanning || isPublishing" class="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
        <p class="text-indigo-700 font-medium animate-pulse">
          {{ isScanning ? 'Analizando base de datos...' : isPublishing ? 'Sincronizando con la nube...' : 'Cargando...' }}
        </p>
      </div>

      <div v-if="errorMsg" class="absolute top-4 left-4 right-4 z-40 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded shadow-sm flex items-center gap-2">
         <span>⚠️</span> {{ errorMsg }}
         <button @click="errorMsg = ''" class="ml-auto text-red-400 hover:text-red-600">✕</button>
      </div>
      <div v-if="successMsg" class="absolute top-4 left-4 right-4 z-40 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded shadow-sm flex items-center gap-2">
         <span>✅</span> {{ successMsg }}
         <button @click="successMsg = ''" class="ml-auto text-green-400 hover:text-green-600">✕</button>
      </div>

      <div v-if="!activeConnection" class="flex-1 flex flex-col items-center justify-center text-slate-300 p-8 text-center">
        <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg>
        <p class="text-lg font-light">Selecciona una conexión para comenzar</p>
      </div>

      <div v-else class="flex flex-col h-full">

        <header class="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h2 class="text-xl font-bold text-slate-800 flex items-center gap-2">
              {{ activeConnection.key }}
              <span v-if="currentDraft?.is_synced" class="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wide border border-green-200">Publicado</span>
              <span v-else-if="currentDraft" class="bg-yellow-100 text-yellow-700 text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wide border border-yellow-200">Borrador Local</span>
            </h2>
            <p class="text-xs text-slate-500 mt-0.5">Base de datos: {{ activeConnection.dbname }}</p>
          </div>

          <div class="flex gap-3" v-if="currentDraft">
             <button
               v-if="!currentDraft.is_synced"
               @click="publishSchema"
               class="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded hover:bg-slate-800 transition shadow-sm flex items-center gap-2"
             >
               🚀 Publicar en Nube
             </button>
             <button
               @click="scanSchema"
               class="px-3 py-2 bg-white border border-slate-300 text-slate-600 text-sm font-medium rounded hover:bg-slate-50 transition"
               title="Re-escanear estructura"
             >
               ↻ Re-escanear
             </button>
          </div>
        </header>

        <div class="flex-1 overflow-hidden relative">

            <div v-if="!currentDraft" class="h-full flex flex-col items-center justify-center bg-slate-50/30 p-8">
                <div class="max-w-md text-center">
                  <div class="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">⚡</div>
                  <h3 class="text-lg font-medium text-slate-800 mb-2">Base de datos no inicializada</h3>
                  <p class="text-sm text-slate-500 mb-6">
                    Para empezar a trabajar, necesitamos escanear la estructura actual de la base de datos.
                  </p>
                  <button @click="scanSchema" class="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg shadow hover:bg-indigo-700 transition transform active:scale-95">
                    Escanear Estructura Ahora
                  </button>
                </div>
            </div>

            <div v-else-if="!selectedTable" class="h-full overflow-y-auto p-6 bg-slate-50/30">
               <div class="flex justify-between items-end mb-4">
                 <h3 class="text-sm font-bold text-slate-500 uppercase tracking-wide">Tablas Detectadas ({{ currentDraft.structure_parsed.length }})</h3>
                 <button @click="showDebug = !showDebug" class="text-xs text-blue-500 hover:underline">debug</button>
               </div>

               <div v-if="showDebug" class="mb-4 p-3 bg-slate-800 text-green-400 rounded text-[10px] font-mono overflow-auto max-h-40">
                  <pre>{{ currentDraft.structure_parsed.slice(0, 2) }} ...</pre>
               </div>

               <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div
                    v-for="table in currentDraft.structure_parsed"
                    :key="table.table_name"
                    @click="openTableEditor(table)"
                    class="bg-white p-4 rounded border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition cursor-pointer group"
                  >
                     <div class="flex items-start justify-between mb-2">
                        <div class="p-2 bg-indigo-50 rounded text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                        </div>
                        <span class="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-1 rounded">{{ table.column_metadata.length }} cols</span>
                     </div>
                     <h4 class="font-bold text-slate-700 text-sm break-all group-hover:text-indigo-700">{{ table.table_name }}</h4>
                     <p class="text-xs text-slate-400 mt-1">Clic para editar metadatos</p>
                  </div>
               </div>
            </div>

            <div v-else class="h-full flex flex-col bg-white">
               <div class="px-6 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <button @click="selectedTable = null" class="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
                    ← Volver al listado
                  </button>
                  <div class="flex gap-3">
                     <button
                       @click="saveDraft"
                       :disabled="isSaving"
                       class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 disabled:bg-indigo-300 transition shadow-sm flex items-center gap-2"
                     >
                       <span v-if="isSaving" class="animate-spin">↻</span>
                       Guardar Cambios
                     </button>
                  </div>
               </div>

               <div class="px-6 py-4 bg-white border-b border-slate-100">
                  <h3 class="text-lg font-bold text-slate-800 font-mono">{{ selectedTable.table_name }}</h3>
                  <p class="text-xs text-slate-500 mt-1">Edita los alias e instrucciones para que la IA entienda mejor esta tabla.</p>
               </div>

               <div class="flex-1 overflow-auto p-6">
                  <table class="w-full text-left border-collapse">
                     <thead>
                        <tr class="text-xs font-bold text-slate-500 border-b border-slate-200 uppercase tracking-wider">
                           <th class="pb-3 pl-2">Campo SQL</th>
                           <th class="pb-3">Alias Humano (Importante)</th>
                           <th class="pb-3">Instrucciones IA</th>
                           <th class="pb-3 text-center w-24">Prioridad</th>
                        </tr>
                     </thead>
                     <tbody class="text-sm">
                        <tr v-for="col in selectedTable.column_metadata" :key="col.col" class="border-b border-slate-50 hover:bg-slate-50 group">

                           <td class="py-3 pl-2 font-mono text-slate-600 text-xs w-1/4">
                             {{ col.col }}
                             <div class="text-[10px] text-slate-400 truncate max-w-[150px]" :title="col.sql_def">{{ col.sql_def }}</div>
                           </td>

                           <td class="py-3 pr-4 w-1/4">
                              <input
                                type="text"
                                v-model="col.desc"
                                class="w-full border border-slate-200 rounded px-2 py-1.5 text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                                placeholder="Ej: Fecha de Venta"
                              >
                           </td>

                           <td class="py-3 pr-4">
                              <input
                                type="text"
                                v-model="col.instructions"
                                class="w-full border border-slate-200 rounded px-2 py-1.5 text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                                placeholder="Opcional: Formato, reglas..."
                              >
                           </td>

                           <td class="py-3 text-center">
                              <input
                                type="checkbox"
                                v-model="col.is_default"
                                class="h-4 w-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                              >
                           </td>
                        </tr>
                     </tbody>
                  </table>
               </div>
            </div>

        </div>

      </div>
    </main>
  </div>
</template>
