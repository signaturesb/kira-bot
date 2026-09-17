'use strict';

require('dotenv').config();

// Capture the single Telegram bot instance without modifying bot.js.
// This keeps the production bot architecture untouched and makes rollback trivial.
const TelegramBotOriginal = require('node-telegram-bot-api');
let capturedBot = null;

class CapturingTelegramBot extends TelegramBotOriginal {
  constructor(...args) {
    super(...args);
    capturedBot = this;
  }
}

// Ensure bot.js receives our compatible subclass when it requires the package.
const telegramModulePath = require.resolve('node-telegram-bot-api');
require.cache[telegramModulePath].exports = CapturingTelegramBot;

// Start Kira exactly as before.
require('./bot.js');

// Register the isolated OpenAI test command on the same Telegram instance.
const { registerOpenAICommand } = require('./openai_command');
const allowedId = parseInt(process.env.TELEGRAM_ALLOWED_USER_ID || '0', 10);
const isAllowed = msg => !!msg?.from && (!allowedId || msg.from.id === allowedId);

if (!capturedBot) {
  console.error('❌ [OPENAI] Telegram bot instance not captured — /gpt disabled');
} else {
  registerOpenAICommand(capturedBot, isAllowed);
  console.log('✅ [OPENAI] /gpt test command registered (isolated, read-only)');
}
