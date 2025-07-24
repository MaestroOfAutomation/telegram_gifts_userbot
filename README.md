# Telegram Gift Monitor

An automated tool for monitoring and purchasing Telegram gifts when their supply is below a specified threshold.

## Features

- Monitors Telegram star gift availability every 0.5 seconds (configurable) using the `getStarGiftOptions` method
- Purchases gifts when their supply is below a specified threshold
- Supports multiple Telegram accounts working asynchronously
- One account checks gift availability, all accounts attempt to purchase gifts to their specific target channels
- Sends notifications to Telegram channels for important events (warnings, successes, errors)
- Telegram controller bot that sends stickers for new gifts and provides inline buttons for purchasing
- Graceful error handling and shutdown

## Requirements

- Node.js 14.x or higher
- Telegram API credentials (API ID and API Hash)
- Telegram accounts that have been authorized to use the API
- (Optional) Telegram bot for notifications

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/autogiftsnodejs.git
   cd autogiftsnodejs
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Copy the example configuration file to create your own configuration:
   ```
   cp example.config.json config.json
   ```

4. Edit the `config.json` file and add your Telegram account credentials and configuration.

## Configuration

The application is configured using a JSON file (`config.json`) in the project root directory. An example configuration file (`example.config.json`) is provided as a template with placeholder values. The actual `config.json` file is included in `.gitignore` to prevent committing sensitive information to the repository.

### Required Configuration

- `supplyThreshold`: The threshold below which the application will try to purchase gifts
- `checkIntervalMs`: The interval for checking gift availability (in milliseconds)
- `telegramAccounts`: An array of Telegram account objects, each containing:
  - `phoneNumber`: The phone number of the Telegram account
  - `targetChannelId`: The target channel ID where gifts will be sent
  - `apiId`: The Telegram API ID for this account
  - `apiHash`: The Telegram API hash for this account
  - `proxy` (optional): HTTP proxy in format "IP:PORT:USERNAME:PASSWORD" (e.g., "123.123.123.123:1234:dddtehni:adddkDDDDzzz")

### Optional Configuration

- `maxGiftsToBuy`: Maximum number of gifts to buy per client account (default: 1)
- `testGiftId`: If specified, this gift ID will be included in the filter even if it's already in the cache (set to null to disable). Use `5870720080265871962` for test (it is sold out 10,000 supply gift). Use only string, not integer type!!!
- `notifications`: Notification settings object:
  - `botToken`: Telegram bot token for sending notifications
  - `channelIds`: Object containing channel IDs for different notification types:
    - `WARNING`: Channel ID for warning notifications
    - `SUCCESS`: Channel ID for success notifications
    - `ERROR`: Channel ID for error notifications
- `controller`: Controller bot settings object:
  - `botToken`: Telegram bot token for the controller bot that sends stickers and provides purchase buttons
  - `channelId`: Channel ID where the controller bot will send stickers and gift information

Example:
```json
{
  "supplyThreshold": 10000,
  "checkIntervalMs": 500,
  "maxGiftsToBuy": 30,
  "telegramAccounts": [
    {
      "phoneNumber": "+1234567890",
      "targetChannelId": "-100123123123",
      "apiId": 12345,
      "apiHash": "abcdef1234567890abcdef1234567890",
      "proxy": "123.123.123.123:1234:dddtehni:adddkDDDDzzz"
    },
    {
      "phoneNumber": "+0987654321",
      "targetChannelId": "-100456456456",
      "apiId": 67890,
      "apiHash": "fedcba0987654321fedcba0987654321"
    }
  ],
  "testGiftId": "5870720080265871962",
  "notifications": {
    "botToken": "1231231231:AAFj1jijasdfisjdfisjdifjsd",
    "channelIds": {
      "WARNING": "-4116110111",
      "SUCCESS": "-4111103118",
      "ERROR": "-4116119115"
    }
  },
  "controller": {
    "botToken": "1231231231:AAFj1jijasdfisjdfisjdifjsd",
    "channelId": "-4116110111"
  }
}
```

## Usage

Start the application:

```
npm start
```

The application will:
1. Initialize Telegram clients for each account
2. Prompt for verification codes if accounts are not already authorized
3. Start monitoring gift availability
4. Attempt to purchase gifts when their supply is below the threshold
5. Send notifications to configured Telegram channels (if enabled)
6. Start the Telegram controller bot (if enabled) that will:
   - Send stickers for new gifts to the configured channel
   - Send gift information (ID, title, purchase stars, availability) as a reply to the sticker
   - Provide inline buttons for purchasing different quantities of the gift (10, 25, 50, 100, or all)

To stop the application, press `Ctrl+C`.

## Authentication

When running the application for the first time, you will be prompted to enter verification codes for each Telegram account. These codes will be sent to your Telegram accounts. After successful authentication, session data will be stored in the `sessions` directory, so you won't need to authenticate again unless the session data is deleted.

## Notifications

### Log Notifications

The application can send notifications to Telegram channels for important events:

- **Warning notifications**: Sent when the application starts, stops, or finds new gifts
- **Success notifications**: Sent when a gift is successfully purchased
- **Error notifications**: Sent when errors occur during gift purchase or other operations

To enable log notifications:
1. Create a Telegram bot using [@BotFather](https://t.me/BotFather) and get the bot token
2. Add the bot to the channels where you want to receive notifications
3. Get the channel IDs for each notification type
4. Configure the notification settings in the `config.json` file (notifications.botToken and notifications.channelIds)

### Controller Bot

The application also includes a Telegram controller bot that:

- Sends stickers for new gifts to a specified channel
- Provides detailed information about each gift (ID, title, purchase stars, availability)
- Includes inline buttons for purchasing different quantities of gifts (10, 25, 50, 100, or all)

The controller bot uses an advanced in-memory approach for sending stickers:
1. Downloads the sticker directly into memory as a buffer using mtcute client
2. Creates an InputFile from the buffer and sends it using grammy without saving to disk
3. Falls back to the direct fileId approach if the download fails

This in-memory approach ensures more reliable sticker delivery while being more efficient by avoiding any temporary file operations.

To enable the controller bot:
1. Create a separate Telegram bot using [@BotFather](https://t.me/BotFather) and get the bot token
2. Add the bot to the channel where you want to receive gift stickers and information
3. Make sure the bot has permission to send messages and stickers in the channel
4. Configure the controller settings in the `config.json` file (controller.botToken and controller.channelId)

## Notes on Payment

This application demonstrates the process of checking gift availability and initiating the purchase process. However, to complete actual purchases, you would need to:

1. Select a payment method
2. Provide payment credentials
3. Confirm the payment

These steps require real payment information and are beyond the scope of this example implementation.

## Project Structure

- `index.js`: Main application entry point
- `src/`
  - `clientManager.js`: Manages Telegram client connections
  - `config.js`: Loads and validates configuration from the JSON configuration file
  - `giftService.js`: Handles gift monitoring and purchasing
  - `logger.js`: Provides logging functionality
  - `telegramNotifier.js`: Sends notifications to Telegram channels
  - `telegramController.js`: Telegram bot that sends stickers and provides purchase buttons

## Troubleshooting

### Common Issues

- **Rate limiting**: If you set `CHECK_INTERVAL_MS` too low (< 100ms), you might encounter rate limiting issues with the Telegram API.
- **Authentication failures**: Make sure your API ID and API Hash for each account are correct in the `config.json` file. If you're having issues with verification codes, try deleting the session files in the `sessions` directory and authenticating again.
- **Gift purchase failures**: Some gifts might have restrictions (e.g., requiring Premium) that prevent purchase.

### Logs

The application logs information to the console. For more detailed troubleshooting, enable notifications to receive error messages in your Telegram channels.

## Code Style

This project follows these code style guidelines:
- Maximum line length of 100-120 characters
- Proper line breaks for function calls, object definitions, and conditional statements
- Consistent indentation throughout the codebase
- Readable formatting for complex expressions

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
