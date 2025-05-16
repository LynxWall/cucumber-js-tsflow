import MessageCollector from '../runtime/message-collector';

declare global {
	// eslint-disable-next-line no-var
	var messageCollector: MessageCollector;
	// eslint-disable-next-line no-var
	var enableVueStyle: boolean;
	// eslint-disable-next-line no-var
	var experimentalDecorators: boolean;
}

export {};
