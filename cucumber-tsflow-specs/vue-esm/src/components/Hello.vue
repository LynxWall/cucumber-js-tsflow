<script setup lang="ts">
	import { computed, ref } from 'vue';
	import { useText } from '@fixtures/use-text';

	const { headerText } = useText();

	const times = ref(2);
	const props = defineProps<{ count: number }>();

	const result = computed(() => props.count * times.value);

	// eslint-disable-next-line no-undef
	defineExpose(props);
</script>

<template>
	<h1>{{ headerText }}</h1>
	<img src="../assets/images/HDRI_Sample_Scene_Balls.jpg" alt="Sample Scene Balls" />
	<div>{{ count }} x {{ times }} = {{ result }}</div>
	<button @click="times += 1">x1</button>
</template>

<style lang="scss">
	// Adding style block to make sure it is not loaded in unit tests.
	// if this block is loaded the transpiler will fail on uncompiled Vue components
	// because it does not include SASS loader support.
	.test-style {
		text-decoration: none;
		transition:
			box-shadow 0.3s cubic-bezier(0.25, 0.8, 0.25, 1),
			background-color 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
		border-radius: 4px;
		border: none;
		box-shadow:
			0 1px 3px rgba(0, 0, 0, 0.12),
			0 1px 2px rgba(0, 0, 0, 0.24);
		&:hover,
		&:focus {
			box-shadow:
				0 14px 28px rgba(0, 0, 0, 0.25),
				0 10px 10px rgba(0, 0, 0, 0.22);
		}
		&:focus {
			text-decoration: underline;
		}
	}
</style>
