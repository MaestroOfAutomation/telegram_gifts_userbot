const fs = require('fs');
const path = require('path');

/**
 * Load configuration from JSON file
 * @returns {Object} Configuration object
 */
function loadConfig() {
    const configPath = path.join(process.cwd(), 'config.json');
    
    if (!fs.existsSync(configPath)) {
        throw new Error('Configuration file not found. Please create config.json in the project root directory.');
    }
    
    try {
        const configData = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        throw new Error(`Failed to load configuration: ${error.message}`);
    }
}

const configData = loadConfig();

/**
 * Process Telegram accounts from config
 * @returns {Array<{phoneNumber: string, targetChannelId: BigInt, apiId: number, apiHash: string}>}
 */
function processTelegramAccounts() {
    const accounts = configData.telegramAccounts || [];
    
    if (accounts.length === 0) {
        throw new Error('No Telegram accounts configured. Please add accounts to config.json');
    }
    
    return accounts.map(account => {
        if (!account.phoneNumber || !account.targetChannelId || !account.apiId || !account.apiHash) {
            throw new Error(`Invalid account format: ${JSON.stringify(account)}. Each account must have phoneNumber, targetChannelId, apiId, and apiHash.`);
        }
        
        return {
            phoneNumber: account.phoneNumber,
            targetChannelId: BigInt(account.targetChannelId),
            apiId: account.apiId,
            apiHash: account.apiHash
        };
    });
}

const testGiftId = configData.testGiftId;
const hasTestGiftId = testGiftId != null && !Number.isNaN(Number(testGiftId));

const telegramBotToken = configData.notifications?.botToken;
const telegramChannelIds = configData.notifications?.channelIds || {};

const telegramControllerBotToken = configData.controller?.botToken;
const telegramControllerChannelId = configData.controller?.channelId;

const config = {
    supplyThreshold: configData.supplyThreshold || 2000,
    checkIntervalMs: configData.checkIntervalMs || 500,
    maxGiftsToBuy: configData.maxGiftsToBuy || 30,
    accounts: processTelegramAccounts(),
    testGiftId: hasTestGiftId ? testGiftId.toString() : null,
    notifications: {
        enabled: !!telegramBotToken && (!!telegramChannelIds.WARNING || !!telegramChannelIds.SUCCESS || !!telegramChannelIds.ERROR),
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