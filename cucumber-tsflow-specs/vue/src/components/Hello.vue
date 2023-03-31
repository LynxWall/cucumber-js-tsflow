<script setup lang="ts">
	import { computed, ref } from 'vue';

	const times = ref(2);
	const props = defineProps<{ count: number }>();

	const result = computed(() => props.count * times.value);

	// eslint-disable-next-line no-undef
	defineExpose(props);
</script>

<template>
	<img src="../assets/images/HDRI_Sample_Scene_Balls.jpg" alt="Sample Scene Balls" />
	<div>{{ count }} x {{ times }} = {{ result }}</div>
	<button @click="times += 1">x1</button>
</template>
