<script setup>
import { ref, onMounted } from 'vue';
import { setApiContext } from './api';
import SchemaManager from './components/SchemaManager.vue'; // Importamos el nuevo componente

const isReady = ref(false);
const userInfo = ref({ user: '', role: '' });

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  const user = params.get('u') || 'dev_admin';
  const role = params.get('r') || 'admin';

  userInfo.value = { user, role };
  setApiContext(user, role);
  isReady.value = true;
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-800">

    <header class="bg-white shadow-sm border-b border-slate-200 px-6 py-4 mb-6">
      <div class="container mx-auto flex justify-between items-center">
        <div class="flex items-center gap-3">
           <div class="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">OB</div>
           <div>
             <h1 class="text-lg font-bold text-slate-800 leading-tight">OBI Client Agent</h1>
             <p class="text-[10px] text-slate-500 uppercase tracking-wider">Modo Administración</p>
           </div>
        </div>
        <div class="text-right text-xs border-l pl-4 border-slate-200">
          <p class="text-slate-500">Usuario: <span class="font-semibold text-slate-700">{{ userInfo.user }}</span></p>
          <p class="text-slate-500">Rol: <span class="font-semibold text-slate-700">{{ userInfo.role }}</span></p>
        </div>
      </div>
    </header>

    <main class="container mx-auto px-6 pb-12">
      <SchemaManager />
    </main>

  </div>
</template>
