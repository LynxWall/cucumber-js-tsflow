import { CreateTranspilerOptions, TranspileOptions, Transpiler, TranspileOutput } from 'ts-node';
import { transpileCode } from './esmbuild';

const create = (_createOptions: CreateTranspilerOptions): Transpiler => {
	return new EsmbuildTranspiler();
};

export class EsmbuildTranspiler implements Transpiler {
	transpile = (input: string, options: TranspileOptions): TranspileOutput => {
		const result = transpileCode(input, options.fileName);

		return {
			outputText: result.output,
			sourceMapText: result.sourceMap
		} as TranspileOutput;
	};
}

exports.create = create;
