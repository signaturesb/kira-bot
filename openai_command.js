'use strict';

const { askOpenAI } = require('./openai_client');

/**
 * Registers an isolated /gpt command on the existing Telegram bot.
 * Usage: /gpt ton message
 * This is deliberately read-only: it does not expose Kira tools to OpenAI yet.
 */
function registerOpenAICommand(bot, isAllowed) {
  bot.onText(/\/gpt(?:\s+([\s\S]+))?$/i, async (msg, match) => {
    if (!isAllowed(msg)) return;
    const chatId = msg.chat.id;
    const prompt = (match?.[1] || '').trim();

    if (!prompt) {
      return bot.sendMessage(chatId,
        '🤖 OpenAI est prêt.\n\nÉcris: /gpt ta question\n\nExemple: /gpt Donne-moi 3 façons de relancer un vendeur chaud.'
      );
    }

    const typing = setInterval(() => bot.sendChatAction(chatId, 'typing').catch(() => {}), 4500);
    try {
      const result = await askOpenAI(prompt);
      const prefix = `🤖 GPT (${result.model})\n\n`;
      const maxChunk = 3900;
      const full = prefix + result.text;
      for (let i = 0; i < full.length; i += maxChunk) {
        await bot.sendMessage(chatId, full.slice(i, i + maxChunk));
      }
    } catch (err) {
      await bot.sendMessage(chatId, `❌ Test OpenAI: ${err.message}`);
    } finally {
      clearInterval(typing);
    }
  });
}

module.exports = { registerOpenAICommand };
