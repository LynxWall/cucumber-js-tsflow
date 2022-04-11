import { CreateTranspilerOptions, TranspileOptions, Transpiler, TranspileOutput } from 'ts-node/dist/transpilers/types';
import { transpileCode } from './esbuild';

const create = (_createOptions: CreateTranspilerOptions): Transpiler => {
	return new EsbuildTranspiler();
};

export class EsbuildTranspiler implements Transpiler {
	transpile = (input: string, options: TranspileOptions): TranspileOutput => {
		const result = transpileCode(input, options.fileName);

		return {
			outputText: result.output,
			sourceMapText: result.sourceMap
		} as TranspileOutput;
	};
}

exports.create = create;
