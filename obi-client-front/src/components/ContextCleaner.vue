<script setup>
import { apiLocal } from '../api';

const props = defineProps({
    dashboard: { type: Object, required: true }
});

const emit = defineEmits(['cleaned']);

const cleanContext = async () => {
    if (!props.dashboard?.context_definition) {
        alert('No hay contexto para limpiar');
        return;
    }
    
    try {
        console.log('🔧 CONTEXT CLEAN: Iniciando limpieza manual...');
        
        // Parsear el contexto actual
        let contextData = typeof props.dashboard.context_definition === 'string'
            ? JSON.parse(props.dashboard.context_definition)
            : props.dashboard.context_definition;
            
        if (!Array.isArray(contextData)) {
            alert('El contexto no es un array válido');
            return;
        }
        
        const originalLength = contextData.length;
        const cleanedData = contextData.filter(item => {
            // Solo mantener elementos con table_id válido
            return item.table_id !== null && 
                   item.table_id !== undefined && 
                   item.table_id !== '' &&
                   !isNaN(Number(item.table_id)) &&
                   Number(item.table_id) > 0;
        });
        
        const removedCount = originalLength - cleanedData.length;
        
        if (removedCount === 0) {
            alert('✅ El contexto ya está limpio, no hay elementos corruptos.');
            return;
        }
        
        // Confirmar antes de proceder
        if (!confirm(`🧹 Se encontraron ${removedCount} elemento(s) con table_id inválido.\n\n¿Deseas limpiarlos ahora?\n\nEsto removerá permanentemente los elementos corruptos de la base de datos.`)) {
            return;
        }
        
        console.log(`🧹 CONTEXT CLEAN: Limpiando ${removedCount} elementos corruptos...`);
        
        // Guardar contexto limpio
        const stringified = JSON.stringify(cleanedData);
        
        await apiLocal.put(`/dashboards/${props.dashboard.id}`, {
            ...props.dashboard,
            context_definition: stringified
        });
        
        console.log(`✅ CONTEXT CLEAN: Contexto limpiado exitosamente. Removidos ${removedCount} elementos.`);
        alert(`✅ ¡Éxito! Contexto limpiado.\n\nRemovidos ${removedCount} elemento(s) corrupto(s).\n\nEl error de sincronización debería desaparecer.`);
        
        // Notificar al componente padre
        emit('cleaned', cleanedData);
        
    } catch (e) {
        console.error('❌ CONTEXT CLEAN: Error durante la limpieza:', e);
        alert('❌ Error durante la limpieza: ' + e.message);
    }
};
</script>

<template>
    <button
        @click="cleanContext"
        class="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors border border-slate-200 hover:border-red-200"
        title="Limpiar elementos con IDs inválidos del contexto"
    >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
        </svg>
        Limpiar Contexto
    </button>
</template>
