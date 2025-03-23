import { ConsoleLogger } from '@cucumber/cucumber/lib/environment/console_logger';
import debug from 'debug';

const debugEnabled = debug.enabled('cucumber');
const logger = new ConsoleLogger(process.stderr, debugEnabled);

export default logger;
