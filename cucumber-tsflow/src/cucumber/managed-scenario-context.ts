import _ from 'underscore';

import { ContextType } from '../types/types';
import { ScenarioContext, ScenarioInfo } from '../types/scenario-context';
import { EndTestCaseInfo, StartTestCaseInfo } from './test-case-info';
import { World } from '@cucumber/cucumber';

class ActiveInfo {
	constructor(obj: any, isContext: boolean = false) {
		this.activeObject = obj;
		this.isContext = isContext;
	}
	activeObject: any;
	isContext: boolean;
	initialized: boolean = false;
}

/**
 * Represents a [[ScenarioContext]] implementation that manages a collection of context objects that
 * are created and used by binding classes during a running Cucumber scenario.
 */
export class ManagedScenarioContext implements ScenarioContext {
	private _scenarioInfo: ScenarioInfo;
	private _activeObjects = new Map<any, ActiveInfo>();

	constructor(scenarioTitle: string, tags: string[]) {
		this._scenarioInfo = new ScenarioInfo(scenarioTitle, tags);
	}

	/**
	 * Gets information about the scenario.
	 *
	 */
	public get scenarioInfo(): ScenarioInfo {
		return this._scenarioInfo;
	}

	public getOrActivateBindingClass(targetPrototype: any, contextTypes: ContextType[], worldObj: World): any {
		return this.getOrActivateObject(targetPrototype, () => {
			return this.activateBindingClass(targetPrototype, contextTypes, worldObj);
		});
	}

	/**
	 * If context objects are passed into our step, this function will
	 * call initialize on the context objects only once.
	 * Using Promise.resolve so that initialize can be synchronous or async.
	 */
	public async initialize(startTestCase: StartTestCaseInfo): Promise<void> {
		for (const [_key, value] of this._activeObjects) {
			if (value.isContext && !value.initialized && typeof value.activeObject.initialize === 'function') {
				await Promise.resolve(value.activeObject.initialize(startTestCase));
				value.initialized = true;
			}
		}
	}

	/**
	 * All objects support dispose, which is executed when a
	 * test run is ended. Using Promise.resolve to support
	 * synchronous or async functions.
	 */
	public async dispose(endTestCase: EndTestCaseInfo): Promise<void> {
		for (const [_key, value] of this._activeObjects) {
			if (typeof value.activeObject.dispose === 'function') {
				await Promise.resolve(value.activeObject.dispose(endTestCase));
			}
		}
	}

	private activateBindingClass(targetPrototype: any, contextTypes: ContextType[], worldObj: World): any {
		const invokeBindingConstructor = (args: any[]): any => {
			switch (contextTypes.length) {
				case 0:
					return new (targetPrototype.constructor as any)();
				case 1:
					return new (targetPrototype.constructor as any)(args[0]);
				case 2:
					return new (targetPrototype.constructor as any)(args[0], args[1]);
				case 3:
					return new (targetPrototype.constructor as any)(args[0], args[1], args[2]);
				case 4:
					return new (targetPrototype.constructor as any)(args[0], args[1], args[2], args[3]);
				case 5:
					return new (targetPrototype.constructor as any)(args[0], args[1], args[2], args[3], args[4]);
				case 6:
					return new (targetPrototype.constructor as any)(args[0], args[1], args[2], args[3], args[4], args[5]);
				case 7:
					return new (targetPrototype.constructor as any)(
						args[0],
						args[1],
						args[2],
						args[3],
						args[4],
						args[5],
						args[6]
					);
				case 8:
					return new (targetPrototype.constructor as any)(
						args[0],
						args[1],
						args[2],
						args[3],
						args[4],
						args[5],
						args[6],
						args[7]
					);
				case 9:
					return new (targetPrototype.constructor as any)(
						args[0],
						args[1],
						args[2],
						args[3],
						args[4],
						args[5],
						args[6],
						args[7],
						args[8]
					);
				case 10:
					return new (targetPrototype.constructor as any)(
						args[0],
						args[1],
						args[2],
						args[3],
						args[4],
						args[5],
						args[6],
						args[7],
						args[8],
						args[9]
					);
			}
		};

		const contextObjects = _.map(contextTypes, contextType =>
			this.getOrActivateContext(
				contextType.prototype,
				(worldObj?: any) => {
					return new contextType(worldObj);
				},
				worldObj
			)
		);

		return invokeBindingConstructor(contextObjects);
	}

	/**
	 * Get or activate any object
	 *
	 * @param targetPrototype prototype for the object
	 * @param activatorFunc callback function used to create an instance of the object
	 * @param optional optional parameter passed into constructors
	 * @returns
	 */
	private getOrActivateObject(targetPrototype: any, activatorFunc: (...args: any[]) => any, optional?: any): any {
		let activeObject = this._activeObjects.get(targetPrototype)?.activeObject;
		if (activeObject) {
			return activeObject;
		}
		activeObject = activatorFunc(optional);
		this._activeObjects.set(targetPrototype, new ActiveInfo(activeObject));
		return activeObject;
	}

	/**
	 * Get or activate Context objects. Marks an object as a context
	 * object in ActiveInfo to let the system know it supports an initialize function.
	 *
	 * @param targetPrototype prototype for the object
	 * @param activatorFunc callback function used to create an instance of the object
	 * @param optional optional parameter passed into constructors
	 * @returns
	 */
	private getOrActivateContext(targetPrototype: any, activatorFunc: (...args: any[]) => any, optional?: any): any {
		let activeObject = this._activeObjects.get(targetPrototype)?.activeObject;
		if (activeObject) {
			return activeObject;
		}
		activeObject = activatorFunc(optional);
		this._activeObjects.set(targetPrototype, new ActiveInfo(activeObject, true));
		return activeObject;
	}
}

export * from '../types/scenario-context';
