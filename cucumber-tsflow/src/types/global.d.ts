import MessageCollector from '../cucumber/message-collector';

declare global {
	// eslint-disable-next-line no-var
	var messageCollector: MessageCollector;
}

export {};
