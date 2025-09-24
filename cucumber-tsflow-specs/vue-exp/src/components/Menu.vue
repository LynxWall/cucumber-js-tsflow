<script lang="ts" setup>
	defineProps<{ menuItems: Record<string, any> }>();
</script>

<template>
	<ul>
		<li v-for="item in menuItems" :key="item.id">
			{{ item.label }}
		</li>
	</ul>
</template>
