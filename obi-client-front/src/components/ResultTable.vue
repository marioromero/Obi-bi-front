<script setup>
import { computed } from 'vue';

const props = defineProps({
  columns: { type: Array, default: () => [] }, // Ej: ['id', 'nombre', 'email']
  rows: { type: Array, default: () => [] },    // Ej: [[1, 'Juan', 'j@test.com'], ...]
  rowCount: { type: Number, default: 0 }
});

// Detectar si hay datos
const hasData = computed(() => props.rows && props.rows.length > 0);
</script>

<template>
  <div class="flex flex-col h-full border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">

    <div class="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
      <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Resultados</span>
      <span class="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-mono">
        {{ rowCount }} filas
      </span>
    </div>

    <div class="flex-1 overflow-auto">

      <div v-if="!hasData" class="h-full flex flex-col items-center justify-center text-slate-400 p-8">
        <p class="text-sm italic">Sin resultados para mostrar</p>
      </div>

      <table v-else class="min-w-full text-left text-sm whitespace-nowrap">
        <thead class="bg-white sticky top-0 shadow-sm z-10">
          <tr>
            <th
              v-for="col in columns"
              :key="col"
              class="px-4 py-3 font-bold text-slate-700 border-b border-slate-200 bg-slate-50"
            >
              {{ col }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="(row, rowIndex) in rows" :key="rowIndex" class="hover:bg-indigo-50/50 transition-colors">
            <td
              v-for="(cell, cellIndex) in row"
              :key="cellIndex"
              class="px-4 py-2 text-slate-600 font-mono text-xs"
            >
              <span v-if="cell === null" class="text-slate-300 italic">NULL</span>
              <span v-else>{{ cell }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
