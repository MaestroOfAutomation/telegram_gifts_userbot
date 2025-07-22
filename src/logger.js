/**
 * Advanced logging system with timestamp support
 */
class Logger {
    /**
     * Log levels
     * @type {{INFO: string, WARNING: string, SUCCESS: string, ERROR: string}}
     */
    static LEVELS = {
        INFO: 'INFO',
        WARNING: 'WARNING',
        SUCCESS: 'SUCCESS',
        ERROR: 'ERROR'
    };

    /**
     * Create a new logger instance
     * @param {Object} options - Logger options
     * @param {boolean} [options.showTimestamp=true] - Whether to show timestamps in logs
     * @param {boolean} [options.useConsole=true] - Whether to output to console
     */
    constructor(options = {}) {
        this.showTimestamp = options.showTimestamp !== false;
        this.useConsole = options.useConsole !== false;
        this.listeners = [];
    }

    /**
     * Add a log listener
     * @param {Function} listener - Function to call with log entries
     */
    addListener(listener) {
        if (typeof listener === 'function') {
            this.listeners.push(listener);
        }
    }

    /**
     * Format a log message
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @returns {string} - Formatted log message
     * @private
     */
    _formatMessage(level, message) {
        const timestamp = this.showTimestamp ? `[${new Date().toISOString()}] ` : '';
        return `${timestamp}[${level}] ${message}`;
    }

    /**
     * Log a message
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data to log
     * @private
     */
    _log(level, message, data) {
        const formattedMessage = this._formatMessage(level, message);
        
        if (this.useConsole) {
            switch (level) {
                case Logger.LEVELS.ERROR:
                    console.error(formattedMessage, data || '');
                    break;
                case Logger.LEVELS.WARNING:
                    console.log('\x1b[33m%s\x1b[0m', formattedMessage, data || '');
                    break;
                case Logger.LEVELS.SUCCESS:
                    console.log('\x1b[32m%s\x1b[0m', formattedMessage, data || '');
                    break;
                default:
                    console.log(formattedMessage, data || '');
            }
        }

        for (const listener of this.listeners) {
            try {
                listener({
                    level,
                    message,
                    formattedMessage,
                    data,
                    timestamp: new Date()
                });
            } catch (error) {
                console.error('Error in log listener:', error);
            }
        }
    }

    /**
     * Log an info message
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data to log
     */
    info(message, data) {
        this._log(Logger.LEVELS.INFO, message, data);
    }

    /**
     * Log a success message
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data to log
     */
    success(message, data) {
        this._log(Logger.LEVELS.SUCCESS, message, data);
    }

    /**
     * Log a warning message
     * @param {string} message - Log message
     * @param {Object} [data] - Additional data to log
     */
    warning(message, data) {
        this._log(Logger.LEVELS.WARNING, message, data);
    }

    /**
     * Log an error message
     * @param {string} message - Log message
     * @param {Object|Error} [error] - Error object or additional data
     */
    error(message, error) {
        let data = error;
        
        if (error instanceof Error) {
            data = {
                message: error.message,
                stack: error.stack,
                name: error.name,
                ...error
            };
        }
        
        this._log(Logger.LEVELS.ERROR, message, data);
    }
}

const defaultLogger = new Logger();

module.exports = {
    Logger,
    logger: defaultLogger,
    LEVELS: Logger.LEVELS
};