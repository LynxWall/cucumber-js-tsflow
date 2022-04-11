export interface VueQuery {
	vue?: boolean;
	src?: string;
	type?: 'script' | 'template' | 'style' | 'custom';
	index?: number;
	lang?: string;
	raw?: boolean;
}

export const parseVueRequest = (
	id: string
): {
	filename: string;
	query: VueQuery;
} => {
	const [filename, rawQuery] = id.split(`?`, 2);
	const query = parseQuery(rawQuery);
	if (query.vue != null) {
		query.vue = true;
	}
	if (query.index != null) {
		query.index = Number(query.index);
	}
	if (query.raw != null) {
		query.raw = true;
	}
	return {
		filename,
		query
	};
};

export const parseQuery = (querystring: string): VueQuery => {
	const vueQuery: any = {};
	const params = new URLSearchParams(querystring);
	for (const key of params.keys()) {
		if (params.getAll(key).length > 1) {
			vueQuery[key] = params.getAll(key);
		} else {
			vueQuery[key] = params.get(key);
		}
	}
	return vueQuery;
};

