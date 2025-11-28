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

    // Auto-seleccionar el primero si no hay activo y existen dashboards
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
        dashboardReports.value = []; // Limpiar reportes
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
        // Recargar reportes del dashboard activo
        if (activeDashboard.value) {
            selectDashboard(activeDashboard.value);
        }
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
    <aside class="w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
        <div class="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h2 class="font-bold text-slate-700 text-sm uppercase tracking-wide">Mis Dashboards</h2>
            <button 
                @click="createDashboard" 
                class="text-indigo-600 hover:bg-indigo-100 p-1.5 rounded-md transition-colors" 
                title="Crear Nuevo Dashboard"
            >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            </button>
        </div>

        <ul class="flex-1 overflow-y-auto p-3 space-y-1">
            <li v-for="dash in dashboards" :key="dash.id">
                <button
                    @click="selectDashboard(dash)"
                    class="w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between items-center group transition-all"
                    :class="activeDashboard?.id === dash.id ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'"
                >
                    <span class="truncate">{{ dash.title }}</span>
                    <span
                        @click.stop="deleteDashboard(dash.id)"
                        class="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded hover:bg-red-50 transition-all"
                        title="Borrar Dashboard"
                    >×</span>
                </button>
            </li>

            <li v-if="dashboards.length === 0" class="p-8 text-center">
                <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 mb-3">
                    <svg class="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                </div>
                <p class="text-xs text-slate-500 italic">No tienes dashboards.</p>
                <button @click="createDashboard" class="mt-2 text-xs text-indigo-600 font-medium hover:underline">Crear uno ahora</button>
            </li>
        </ul>
    </aside>

    <!-- ÁREA PRINCIPAL: GRID DE INSTRUMENTOS -->
    <main class="flex-1 overflow-y-auto p-8 relative bg-slate-50/50">

        <!-- Header del Dashboard -->
        <div v-if="activeDashboard" class="mb-8 flex justify-between items-end border-b border-slate-200 pb-6">
            <div>
                <h1 class="text-3xl font-bold text-slate-800 tracking-tight">{{ activeDashboard.title }}</h1>
                <p class="text-slate-500 text-sm mt-1 flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-green-500"></span>
                    {{ dashboardReports.length }} instrumentos activos
                </p>
            </div>
            <button
                @click="openNewInstrument"
                class="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md flex items-center gap-2"
            >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                Nuevo Instrumento
            </button>
        </div>

        <!-- Grid -->
        <div v-if="activeDashboard" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

            <div
                v-for="report in dashboardReports"
                :key="report.id"
                class="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden flex flex-col h-64 group"
            >
                <!-- Card Header -->
                <div class="px-5 py-4 border-b border-slate-100 flex justify-between items-start bg-white">
                    <div class="flex-1 min-w-0 pr-2">
                        <h3 class="font-bold text-slate-800 truncate text-base" :title="report.name">{{ report.name }}</h3>
                        <p class="text-[10px] text-slate-400 mt-0.5 truncate">ID: {{ report.id }} • {{ report.type || 'Tabla' }}</p>
                    </div>
                    <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                            @click="openEditInstrument(report)" 
                            class="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                            title="Editar / Chat"
                        >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </button>
                        <button 
                            @click="deleteInstrument(report.id)" 
                            class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Eliminar"
                        >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </div>

                <!-- Preview (SQL Snippet) -->
                <div class="flex-1 p-0 overflow-hidden relative bg-slate-50 group-hover:bg-slate-100/50 transition-colors cursor-pointer" @click="openEditInstrument(report)">
                    <div class="absolute inset-0 p-4">
                        <div class="w-full h-full bg-white border border-slate-200 rounded-lg p-3 overflow-hidden">
                            <code class="text-[10px] font-mono text-slate-500 block whitespace-pre-wrap break-all leading-relaxed">
                                {{ report.sql_query }}
                            </code>
                        </div>
                    </div>
                    <!-- Overlay al hacer hover -->
                    <div class="absolute inset-0 bg-indigo-900/0 group-hover:bg-indigo-900/5 transition-colors flex items-center justify-center">
                        <span class="opacity-0 group-hover:opacity-100 bg-white text-indigo-600 px-3 py-1 rounded-full text-xs font-bold shadow-sm transform translate-y-2 group-hover:translate-y-0 transition-all">
                            Abrir Editor
                        </span>
                    </div>
                </div>
            </div>
            
            <!-- Botón "Nuevo" como tarjeta (opcional, para UX) -->
            <button 
                @click="openNewInstrument"
                class="border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center h-64 text-slate-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all group"
            >
                <div class="w-12 h-12 rounded-full bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center mb-3 transition-colors">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                </div>
                <span class="font-medium text-sm">Crear nuevo instrumento</span>
            </button>

        </div>

        <!-- Estado Vacío (Sin Dashboard Seleccionado) -->
        <div v-else class="h-full flex flex-col items-center justify-center text-slate-400">
            <div class="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                <svg class="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
            </div>
            <h3 class="text-lg font-medium text-slate-600 mb-2">Ningún dashboard seleccionado</h3>
            <p class="max-w-xs text-center text-sm">Selecciona uno de la lista de la izquierda o crea uno nuevo para comenzar a trabajar.</p>
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
