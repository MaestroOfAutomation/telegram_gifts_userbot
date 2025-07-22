# Telegram Gift Monitor

An automated tool for monitoring and purchasing Telegram gifts when their supply is below a specified threshold.

## Features

- Monitors Telegram star gift availability every 0.5 seconds (configurable) using the `getStarGiftOptions` method
- Purchases gifts when their supply is below a specified threshold
- Supports multiple Telegram accounts working asynchronously
- One account checks gift availability, all accounts attempt to purchase gifts to their specific target channels
- Sends notifications to Telegram channels for important events (warnings, successes, errors)
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

3. Create a `.env` file based on the provided `.env.example`:
   ```
   cp .env.example .env
   ```

4. Edit the `.env` file and add your Telegram account credentials and configuration.

## Configuration

The application is configured using environment variables in the `.env` file:

### Required Configuration

- `API_ID`: Common Telegram API ID for all accounts
- `API_HASH`: Common Telegram API hash for all accounts
- `SUPPLY_THRESHOLD`: The threshold below which the application will try to purchase gifts
- `CHECK_INTERVAL_MS`: The interval for checking gift availability (in milliseconds)
- `TELEGRAM_ACCOUNTS`: A comma-separated list of Telegram accounts in the format `phone_number:target_channel_id` where each account has its own target channel ID

### Optional Configuration

- `TEST_GIFT_ID`: If specified, this gift ID will be included in the filter even if it's already in the cache (set to "none" or leave empty to disable)
- `TELEGRAM_BOT_TOKEN`: Telegram bot token for sending notifications
- `TELEGRAM_WARNING_CHANNEL_ID`: Channel ID for warning notifications
- `TELEGRAM_SUCCESS_CHANNEL_ID`: Channel ID for success notifications
- `TELEGRAM_ERROR_CHANNEL_ID`: Channel ID for error notifications

Example:
```
API_ID=12345
API_HASH=abcdef1234567890abcdef1234567890
SUPPLY_THRESHOLD=10
CHECK_INTERVAL_MS=500
TELEGRAM_ACCOUNTS=+1234567890:123123123,+0987654321:456456456

# Notification settings (optional)
TELEGRAM_BOT_TOKEN=1231231231:AAFj1jijasdfisjdfisjdifjsd
TELEGRAM_WARNING_CHANNEL_ID=-4116110111
TELEGRAM_SUCCESS_CHANNEL_ID=-4111103118
TELEGRAM_ERROR_CHANNEL_ID=-4116119115

# Test gift ID (optional). 5870720080265871962 (sold out)
TEST_GIFT_ID=
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

To stop the application, press `Ctrl+C`.

## Authentication

When running the application for the first time, you will be prompted to enter verification codes for each Telegram account. These codes will be sent to your Telegram accounts. After successful authentication, session data will be stored in the `sessions` directory, so you won't need to authenticate again unless the session data is deleted.

## Notifications

The application can send notifications to Telegram channels for important events:

- **Warning notifications**: Sent when the application starts, stops, or finds new gifts
- **Success notifications**: Sent when a gift is successfully purchased
- **Error notifications**: Sent when errors occur during gift purchase or other operations

To enable notifications:
1. Create a Telegram bot using [@BotFather](https://t.me/BotFather) and get the bot token
2. Add the bot to the channels where you want to receive notifications
3. Get the channel IDs for each notification type
4. Configure the notification settings in the `.env` file

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
  - `config.js`: Loads and validates configuration from environment variables
  - `giftService.js`: Handles gift monitoring and purchasing
  - `logger.js`: Provides logging functionality
  - `telegramNotifier.js`: Sends notifications to Telegram channels

## Troubleshooting

### Common Issues

- **Rate limiting**: If you set `CHECK_INTERVAL_MS` too low (< 100ms), you might encounter rate limiting issues with the Telegram API.
- **Authentication failures**: Make sure your API ID and API Hash are correct. If you're having issues with verification codes, try deleting the session files in the `sessions` directory and authenticating again.
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

## License

ISC

---

*Last updated: July 22, 2025*