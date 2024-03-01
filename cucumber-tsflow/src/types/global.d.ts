import MessageCollector from '../cucumber/message-collector';

declare global {
	// eslint-disable-next-line no-var
	var messageCollector: MessageCollector;
	// eslint-disable-next-line no-var
	var enableVueStyle: boolean;
}

export {};
