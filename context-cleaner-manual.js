// 🎯 LIMPIEZA MANUAL DE CONTEXTO CORRUPTO
// Ejecutar en consola del navegador cuando el dashboard esté abierto

// Función de limpieza directa
const cleanDashboardContext = async () => {
    try {
        console.log('🧹 CONTEXT CLEAN: Iniciando limpieza manual...');
        
        // Buscar el dashboard activo en Vue DevTools o usar window.$nuxt o la app Vue
        const appElement = document.querySelector('#app') || document.body;
        const vueApp = window.__VUE_APP__ || window.nuxt || window.Vue;
        
        if (!vueApp && !window.nuxt) {
            console.error('❌ No se puede acceder a la aplicación Vue. Asegúrate de tener las herramientas de desarrollador abiertas.');
            return;
        }
        
        // Obtener el contexto actual del dashboard activo
        let contextData;
        if (typeof activeDashboard !== 'undefined') {
            contextData = activeDashboard.value?.context_definition;
        } else {
            console.log('🔍 Buscando contexto en localStorage o sessionStorage...');
            // Intentar desde localStorage si está disponible
            const storedContext = localStorage.getItem('dashboard_context') || sessionStorage.getItem('dashboard_context');
            if (storedContext) {
                contextData = JSON.parse(storedContext);
            }
        }
        
        if (!contextData) {
            alert('❌ No se encontró contexto para limpiar. Abre el dashboard y luego ejecuta esta función.');
            return;
        }
        
        console.log('📋 Contexto encontrado:', contextData);
        
        // Parsear si es string
        if (typeof contextData === 'string') {
            contextData = JSON.parse(contextData);
        }
        
        if (!Array.isArray(contextData)) {
            alert('❌ El contexto no es un array válido.');
            return;
        }
        
        const originalLength = contextData.length;
        
        // Filtrar elementos con table_id null/inválido
        const cleanedData = contextData.filter(item => {
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
        
        console.log(`🧹 Encontrados ${removedCount} elementos corruptos. Limpiando...`);
        console.log('📋 Contexto limpio:', cleanedData);
        
        // Si tenemos acceso a la API, guardarlo directamente
        if (typeof apiLocal !== 'undefined' && typeof activeDashboard !== 'undefined') {
            const dashboardId = activeDashboard.value?.id;
            if (dashboardId) {
                const stringified = JSON.stringify(cleanedData);
                activeDashboard.value.context_definition = stringified;
                
                await apiLocal.put(`/dashboards/${dashboardId}`, {
                    ...activeDashboard.value,
                    context_definition: stringified
                });
                
                console.log('✅ Contexto limpiado y guardado en BD');
                alert(`✅ ¡Éxito! Contexto limpiado.\n\nRemovidos ${removedCount} elemento(s) corrupto(s).\n\nRecarga la página para ver el efecto.`);
                
                // Recargar reportes si es posible
                if (typeof selectDashboard !== 'undefined') {
                    selectDashboard(activeDashboard.value);
                }
                return;
            }
        }
        
        console.log('⚠️ No se pudo guardar automáticamente. Context en consola para copiar manualmente:');
        console.log('const cleanedContext = ' + JSON.stringify(cleanedData, null, 2));
        console.log('Copia esto y pégalo en la base de datos o úsalo para actualizar manualmente.');
        
        alert(`🧹 Se encontraron ${removedCount} elementos corruptos.\n\nContexto limpio disponible en consola como 'cleanedContext'.\n\nPuedes copiarlo y actualizar la base de datos manualmente.`);
        
    } catch (e) {
        console.error('❌ Error durante la limpieza:', e);
        alert('❌ Error durante la limpieza: ' + e.message);
    }
};

// Auto-ejecutar la función
cleanDashboardContext();
