require('dotenv').config();

/**
 * Parse Telegram accounts from environment variable
 * @returns {Array<{phoneNumber: string, targetChannelId: BigInt}>}
 */
function parseTelegramAccounts() {
    const accountsStr = process.env.TELEGRAM_ACCOUNTS || '';
    if (!accountsStr) {
        throw new Error('No Telegram accounts configured. Please set TELEGRAM_ACCOUNTS in .env file');
    }

    return accountsStr.split(',').map(account => {
        const [phoneNumber, targetChannelId] = account.split(':');
        
        if (!phoneNumber || !targetChannelId) {
            throw new Error(`Invalid account format: ${account}. Expected format: phone_number:target_channel_id`);
        }
        
        return {
            phoneNumber: phoneNumber.trim(),
            targetChannelId: BigInt(targetChannelId.trim())
        };
    });
}

const apiId = parseInt(process.env.API_ID || '0', 10);
const apiHash = process.env.API_HASH || '';

if (!apiId || !apiHash) {
    throw new Error('API_ID and API_HASH must be provided in .env file');
}

const testGiftId = process.env.TEST_GIFT_ID;
const hasTestGiftId = testGiftId && testGiftId.toLowerCase() !== 'none';

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChannelIds = {
    WARNING: process.env.TELEGRAM_WARNING_CHANNEL_ID,
    SUCCESS: process.env.TELEGRAM_SUCCESS_CHANNEL_ID,
    ERROR: process.env.TELEGRAM_ERROR_CHANNEL_ID
};

const telegramControllerBotToken = process.env.TELEGRAM_CONTROLLER_BOT_TOKEN;
const telegramControllerChannelId = process.env.TELEGRAM_CONTROLLER_CHANNEL_ID;

const config = {
    apiId,
    apiHash,
    supplyThreshold: parseInt(process.env.SUPPLY_THRESHOLD || '2000', 10),
    checkIntervalMs: parseInt(process.env.CHECK_INTERVAL_MS || '500', 10),
    maxGiftsToBuy: parseInt(process.env.MAX_GIFTS_TO_BUY || '30', 10),
    accounts: parseTelegramAccounts(),
    testGiftId: hasTestGiftId ? testGiftId : null,
    notifications: {
        enabled: !!telegramBotToken && (!!telegramChannelIds.INFO || !!telegramChannelIds.SUCCESS || !!telegramChannelIds.ERROR),
        botToken: telegramBotToken,
        channelIds: telegramChannelIds
    },
    controller: {
        enabled: !!telegramControllerBotToken && !!telegramControllerChannelId,
        botToken: telegramControllerBotToken,
        channelId: telegramControllerChannelId
    }
};

if (config.checkIntervalMs < 100) {
    console.warn('Warning: CHECK_INTERVAL_MS is very low. This might cause rate limiting issues.');
}

if (config.accounts.length === 0) {
    throw new Error('No valid Telegram accounts found in configuration');
}

module.exports = config;