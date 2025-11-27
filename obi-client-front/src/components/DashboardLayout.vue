<script setup>
import { ref, onMounted } from 'vue';
import { apiLocal, sessionState } from '../api';
import InstrumentEditor from './InstrumentEditor.vue';

// Estado
const dashboards = ref([]);
const activeDashboard = ref(null);
const dashboardReports = ref([]);
const isLoading = ref(false);

// Estado del Modal Editor
const showEditor = ref(false);
const reportToEdit = ref(null); // Null = Nuevo

// --- CRUD DASHBOARDS ---
const loadDashboards = async () => {
  try {
    const res = await apiLocal.get('/dashboards/');
    dashboards.value = res;

    // Auto-seleccionar el primero si no hay activo
    if (!activeDashboard.value && dashboards.value.length > 0) {
        selectDashboard(dashboards.value[0]);
    }
  } catch (e) {
    console.error("Error cargando dashboards:", e);
  }
};

const createDashboard = async () => {
  const title = prompt("Nombre del nuevo Dashboard:");
  if (!title) return;

  try {
    const res = await apiLocal.post('/dashboards/', {
        title: title,
        user_identifier: sessionState.value.user
    });
    await loadDashboards();
    selectDashboard(res); // Seleccionar el recién creado
  } catch (e) {
    alert("Error creando dashboard: " + e.message);
  }
};

const deleteDashboard = async (id) => {
    if (!confirm("¿Estás seguro? Se borrarán todos los reportes dentro.")) return;
    try {
        await apiLocal.delete(`/dashboards/${id}`);
        activeDashboard.value = null;
        loadDashboards();
    } catch (e) {
        alert(e.message);
    }
};

const selectDashboard = async (dash) => {
    activeDashboard.value = dash;
    isLoading.value = true;
    try {
        // Cargar reportes de este dashboard
        const res = await apiLocal.get('/reports/', {
            params: { dashboard_id: dash.id }
        });
        dashboardReports.value = res;
    } catch (e) {
        console.error(e);
    } finally {
        isLoading.value = false;
    }
};

// --- GESTIÓN INSTRUMENTOS ---
const openNewInstrument = () => {
    reportToEdit.value = null;
    showEditor.value = true;
};

const openEditInstrument = (report) => {
    reportToEdit.value = report;
    showEditor.value = true;
};

const deleteInstrument = async (id) => {
    if (!confirm("¿Eliminar este instrumento?")) return;
    try {
        await apiLocal.delete(`/reports/${id}`);
        selectDashboard(activeDashboard.value); // Recargar
    } catch (e) { alert(e.message); }
};

const onEditorClose = () => {
    showEditor.value = false;
};

const onEditorSaved = () => {
    // Recargar la vista del dashboard actual para ver el nuevo ítem
    if (activeDashboard.value) selectDashboard(activeDashboard.value);
};

onMounted(() => {
    loadDashboards();
});
</script>

<template>
  <div class="flex h-[calc(100vh-80px)] bg-slate-100">

    <!-- SIDEBAR IZQUIERDO: LISTA DE DASHBOARDS -->
    <aside class="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div class="p-4 border-b border-slate-100 flex justify-between items-center">
            <h2 class="font-bold text-slate-700 text-sm uppercase tracking-wide">Mis Dashboards</h2>
            <button @click="createDashboard" class="text-indigo-600 hover:bg-indigo-50 p-1 rounded" title="Crear Nuevo">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            </button>
        </div>

        <ul class="flex-1 overflow-y-auto p-2 space-y-1">
            <li v-for="dash in dashboards" :key="dash.id">
                <button
                    @click="selectDashboard(dash)"
                    class="w-full text-left px-3 py-2 rounded-md text-sm flex justify-between items-center group transition-colors"
                    :class="activeDashboard?.id === dash.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600 hover:bg-slate-50'"
                >
                    <span class="truncate">{{ dash.title }}</span>
                    <span
                        @click.stop="deleteDashboard(dash.id)"
                        class="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 px-1"
                    >×</span>
                </button>
            </li>

            <li v-if="dashboards.length === 0" class="p-4 text-xs text-slate-400 text-center italic">
                No tienes dashboards. Crea uno para empezar.
            </li>
        </ul>
    </aside>

    <!-- ÁREA PRINCIPAL: GRID DE INSTRUMENTOS -->
    <main class="flex-1 overflow-y-auto p-8 relative">

        <!-- Header del Dashboard -->
        <div v-if="activeDashboard" class="mb-8 flex justify-between items-end">
            <div>
                <h1 class="text-2xl font-bold text-slate-800">{{ activeDashboard.title }}</h1>
                <p class="text-slate-500 text-sm mt-1">{{ dashboardReports.length }} instrumentos</p>
            </div>
            <button
                @click="openNewInstrument"
                class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition shadow-sm flex items-center gap-2"
            >
                <span>+</span> Nuevo Instrumento
            </button>
        </div>

        <!-- Grid -->
        <div v-if="activeDashboard" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6">

            <div
                v-for="report in dashboardReports"
                :key="report.id"
                class="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col h-80 group"
            >
                <!-- Card Header -->
                <div class="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 class="font-bold text-slate-700 truncate" :title="report.name">{{ report.name }}</h3>
                    <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button @click="openEditInstrument(report)" class="text-xs text-indigo-600 hover:underline">Editar/Chat</button>
                        <button @click="deleteInstrument(report.id)" class="text-xs text-red-500 hover:underline">Borrar</button>
                    </div>
                </div>

                <!-- Preview (Mini Tabla estática o placeholder) -->
                <div class="flex-1 p-4 overflow-hidden text-xs text-slate-500 relative">
                    <!-- Aquí podríamos renderizar una mini tabla real si guardamos los datos, o un placeholder visual -->
                    <div class="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-300">
                        <span class="text-4xl">📊</span>
                    </div>
                    <div class="absolute bottom-2 left-4 right-4 bg-white/90 px-2 py-1 rounded border text-[10px] font-mono truncate">
                        {{ report.sql_query }}
                    </div>
                </div>
            </div>

        </div>

        <!-- Estado Vacío -->
        <div v-else class="h-full flex flex-col items-center justify-center text-slate-400">
            <svg class="w-20 h-20 mb-4 opacity-20" fill="currentColor" viewBox="0 0 20 20"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
            <p>Selecciona un dashboard para ver sus datos.</p>
        </div>

    </main>

    <!-- MODAL EDITOR (OVERLAY) -->
    <InstrumentEditor
        v-if="showEditor"
        :dashboard-id="activeDashboard.id"
        :initial-report="reportToEdit"
        @close="onEditorClose"
        @saved="onEditorSaved"
    />

  </div>
</template>
