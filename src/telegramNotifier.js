/**
 * Telegram notification service
 * Sends notifications to Telegram channels based on log level
 */
const https = require('https');
const { LEVELS } = require('./logger');

class TelegramNotifier {
    /**
     * Create a new Telegram notifier
     * @param {Object} config - Configuration object
     * @param {string} config.botToken - Telegram bot token
     * @param {Object} config.channelIds - Channel IDs for different log levels
     * @param {string} [config.channelIds.INFO] - Channel ID for info messages
     * @param {string} [config.channelIds.SUCCESS] - Channel ID for success messages
     * @param {string} [config.channelIds.ERROR] - Channel ID for error messages
     */
    constructor(config) {
        this.botToken = config.botToken;
        this.channelIds = config.channelIds || {};
        
        if (!this.botToken) {
            console.warn('TelegramNotifier: No bot token provided, notifications will be disabled');
        }
        
        if (!this.channelIds.INFO && 
            !this.channelIds.SUCCESS && 
            !this.channelIds.ERROR) {
            console.warn('TelegramNotifier: No channel IDs provided, notifications will be disabled');
        }
    }

    /**
     * Send a message to a Telegram channel (non-blocking)
     * @param {string} chatId - Telegram chat ID
     * @param {string} message - Message to send
     * @returns {Object} - Immediate response object
     * @private
     */
    _sendMessage(chatId, message) {
        if (!this.botToken || !chatId) {
            return { ok: false, error: 'Missing bot token or chat ID' };
        }

        const data = JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${this.botToken}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(
            options, 
            (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(responseData);
                        if (!parsedData.ok) {
                            console.error('Telegram notification failed:', parsedData);
                        }
                    } catch (error) {
                        console.error(`Failed to parse Telegram API response: ${error.message}`);
                    }
                });
            }
        );

        req.on('error', (error) => {
            console.error(`Failed to send Telegram notification: ${error.message}`);
        });

        req.write(data);
        req.end();

        return { ok: true, message: 'Notification sent in background' };
    }

    /**
     * Send a notification based on log level
     * @param {string} level - Log level
     * @param {string} message - Message to send
     * @returns {Object} - Response object
     */
    notify(level, message) {
        const chatId = this.channelIds[level];
        
        if (!chatId) {
            return { ok: false, error: `No channel ID configured for level: ${level}` };
        }

        return this._sendMessage(chatId, message);
    }

    /**
     * Send an warning notification
     * @param {string} message - Message to send
     * @returns {Object} - Response object
     */
    warning(message) {
        return this.notify(LEVELS.WARNING, message);
    }

    /**
     * Send a success notification
     * @param {string} message - Message to send
     * @returns {Object} - Response object
     */
    success(message) {
        return this.notify(LEVELS.SUCCESS, message);
    }

    /**
     * Send an error notification
     * @param {string} message - Message to send
     * @returns {Object} - Response object
     */
    error(message) {
        return this.notify(LEVELS.ERROR, message);
    }

    /**
     * Create a log listener that sends notifications
     * @returns {Function} - Log listener function
     */
    createLogListener() {
        return (logEntry) => {
            const { level, message, data } = logEntry;
            
            if (level === 'INFO') {
                return;
            }
            
            let telegramMessage = `<b>[${level}]</b> ${message}`;
            
            if (data) {
                if (typeof data === 'object') {
                    let data_json;
                    try {
                        data_json = JSON.stringify(data, null, 2);
                    } catch (error) {
                        data_json = 'Error dumping value...';
                    }
                    telegramMessage += `\n<pre>${data_json}</pre>`;
                } else if (typeof data === 'string' && 
                           data.length > 0) {
                    telegramMessage += `\n${data}`;
                }
            }
            
            this.notify(level, telegramMessage);
        };
    }
}

module.exports = TelegramNotifier;