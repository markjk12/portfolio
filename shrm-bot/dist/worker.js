/**
 * ШРМ — демо-бот заказов (Telegram + Mini App) для Cloudflare Workers.
 *
 * Telegram присылает сюда каждое сообщение бота (webhook). Бот ничего не
 * хранит: корзина собирается в мини-приложении, данные заказа живут в самих
 * сообщениях Telegram.
 *
 * Настройки (Settings → Variables and Secrets):
 *   BOT_TOKEN       — ключ бота от @BotFather (секрет)
 *   WEBHOOK_SECRET  — длинная строка из букв и цифр (секрет)
 *   OWNER_CHAT_ID   — куда присылать заказы (узнать: команда /id), необязательно
 *   DEMO            — "1": карточка заказа приходит и покупателю, чтобы любой
 *                     мог увидеть, как это выглядит у владельца
 *   APP_URL         — адрес мини-приложения, необязательно
 */

const MENU = {
  "categories": [
    {
      "id": "shawarma",
      "title": "Шаурма"
    },
    {
      "id": "grill",
      "title": "Гриль"
    },
    {
      "id": "snacks",
      "title": "Закуски"
    },
    {
      "id": "combo",
      "title": "Комбо"
    },
    {
      "id": "drinks",
      "title": "Напитки"
    }
  ],
  "items": [
    {
      "id": "sh_classic",
      "cat": "shawarma",
      "title": "Шаурма Классика",
      "img": "shawarma-classic",
      "sizes": [
        {
          "id": "s",
          "title": "Стандарт",
          "price": 389,
          "weight": "340 г"
        },
        {
          "id": "b",
          "title": "Большая",
          "price": 439,
          "weight": "440 г"
        }
      ]
    },
    {
      "id": "sh_spicy",
      "cat": "shawarma",
      "title": "Шаурма Острая",
      "img": "shawarma-spicy",
      "sizes": [
        {
          "id": "s",
          "title": "Стандарт",
          "price": 389,
          "weight": "350 г"
        },
        {
          "id": "b",
          "title": "Большая",
          "price": 439,
          "weight": "455 г"
        }
      ]
    },
    {
      "id": "sh_cheese",
      "cat": "shawarma",
      "title": "Шаурма Сырная",
      "img": "shawarma-cheese",
      "sizes": [
        {
          "id": "s",
          "title": "Стандарт",
          "price": 389,
          "weight": "380 г"
        },
        {
          "id": "b",
          "title": "Большая",
          "price": 439,
          "weight": "470 г"
        }
      ]
    },
    {
      "id": "lula",
      "cat": "grill",
      "title": "Люля из курицы",
      "img": "lula",
      "sizes": [
        {
          "id": "s",
          "title": "",
          "price": 359,
          "weight": "225 г"
        }
      ]
    },
    {
      "id": "shashlik",
      "cat": "grill",
      "title": "Шашлык из курицы",
      "img": "shashlik",
      "sizes": [
        {
          "id": "s",
          "title": "",
          "price": 419,
          "weight": "249 г"
        }
      ]
    },
    {
      "id": "fries",
      "cat": "snacks",
      "title": "Картофель фри",
      "img": "fries",
      "sizes": [
        {
          "id": "s",
          "title": "",
          "price": 149,
          "weight": "120 г"
        }
      ]
    },
    {
      "id": "nuggets",
      "cat": "snacks",
      "title": "Наггетсы",
      "img": "nuggets",
      "sizes": [
        {
          "id": "s",
          "title": "",
          "price": 149,
          "weight": "100 г"
        }
      ]
    },
    {
      "id": "combo",
      "cat": "combo",
      "title": "Комбо: шаурма + морс",
      "img": "combo",
      "sizes": [
        {
          "id": "s",
          "title": "",
          "price": 499,
          "weight": ""
        }
      ]
    },
    {
      "id": "mors_orange",
      "cat": "drinks",
      "title": "Морс апельсин",
      "sizes": [
        {
          "id": "s",
          "title": "",
          "price": 139,
          "weight": "330 мл"
        }
      ]
    },
    {
      "id": "mors_cherry",
      "cat": "drinks",
      "title": "Морс вишня",
      "sizes": [
        {
          "id": "s",
          "title": "",
          "price": 139,
          "weight": "330 мл"
        }
      ]
    },
    {
      "id": "mors_apple",
      "cat": "drinks",
      "title": "Морс яблоко",
      "sizes": [
        {
          "id": "s",
          "title": "",
          "price": 139,
          "weight": "330 мл"
        }
      ]
    },
    {
      "id": "dobry_orange",
      "cat": "drinks",
      "title": "«Добрый» апельсин",
      "sizes": [
        {
          "id": "s",
          "title": "",
          "price": 150,
          "weight": "500 мл"
        }
      ]
    },
    {
      "id": "dobry_cola",
      "cat": "drinks",
      "title": "«Добрый» кола",
      "sizes": [
        {
          "id": "s",
          "title": "",
          "price": 150,
          "weight": "500 мл"
        }
      ]
    },
    {
      "id": "dobry_lime",
      "cat": "drinks",
      "title": "«Добрый» лимон-лайм",
      "sizes": [
        {
          "id": "s",
          "title": "",
          "price": 150,
          "weight": "500 мл"
        }
      ]
    },
    {
      "id": "bonaqua",
      "cat": "drinks",
      "title": "BonAqua",
      "sizes": [
        {
          "id": "s",
          "title": "",
          "price": 100,
          "weight": "500 мл"
        }
      ]
    }
  ]
};
const ITEMS = Object.fromEntries(MENU.items.map((i) => [i.id, i]));
const ADDRESS = "проспект Дзержинского, 2/2 (киоск у ТЦ «Роща»)";
const DEFAULT_APP_URL = "https://markjk12.github.io/portfolio/shrm-bot/app/";

// ---------- Telegram ----------

function telegram(env) {
  return async function api(method, params) {
    const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await r.json().catch(() => ({}));
    if (!data.ok) console.log("telegram error", method, r.status, data.description);
    return data.result;
  };
}

const rub = (n) => n.toLocaleString("ru-RU").replace(/ /g, " ") + " ₽";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function menuKeyboard(env) {
  return {
    keyboard: [[{ text: "🌯 Открыть меню", web_app: { url: env.APP_URL || DEFAULT_APP_URL } }]],
    resize_keyboard: true,
    is_persistent: true,
  };
}

// ---------- Заказ ----------

class BadOrder extends Error {}

/** Проверяет заказ из мини-приложения и считает сумму заново по своему меню:
 *  цены, присланные с телефона, не используются. */
export function parseOrder(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { throw new BadOrder("не удалось прочитать заказ"); }
  if (!data || typeof data !== "object" || !Array.isArray(data.items)) throw new BadOrder("пустой заказ");

  const lines = [];
  let total = 0;
  for (const row of data.items.slice(0, 30)) {
    if (!Array.isArray(row) || row.length !== 3) throw new BadOrder("ошибка в позиции");
    const [itemId, sizeId, qty] = row;
    const item = ITEMS[itemId];
    const size = item && item.sizes.find((s) => s.id === sizeId);
    if (!size || !Number.isInteger(qty) || qty < 1 || qty > 20) throw new BadOrder("ошибка в позиции");
    const name = item.title + (size.title ? `, ${size.title.toLowerCase()}` : "");
    lines.push([name, qty, size.price * qty]);
    total += size.price * qty;
  }
  if (!lines.length) throw new BadOrder("пустой заказ");

  if (!["pickup", "here"].includes(data.mode)) throw new BadOrder("не выбран способ получения");
  if (data.time !== "asap" && !(typeof data.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(data.time)))
    throw new BadOrder("неверное время");

  const name = String(data.name ?? "").trim().slice(0, 40);
  const phone = String(data.phone ?? "").replace(/[^\d+]/g, "").slice(0, 16);
  if (!name || phone.replace(/\D/g, "").length < 10) throw new BadOrder("нужны имя и телефон");
  const comment = String(data.comment ?? "").trim().slice(0, 200);

  return { lines, total, mode: data.mode, time: data.time, name, phone, comment };
}

const whenText = (o) => (o.time === "asap" ? "как можно скорее" : `к ${o.time}`);
const modeText = (m) => (m === "pickup" ? "Самовывоз" : "Поест на месте");
const itemsText = (o) =>
  o.lines.map(([n, q, s]) => `• ${esc(n)} × ${q} — ${rub(s)}`).join("\n") + `\n\n<b>Итого: ${rub(o.total)}</b>`;

function ownerCard(num, o, user) {
  let who = esc(o.name);
  if (user && user.username) who += ` (@${esc(user.username)})`;
  let text =
    `🆕 <b>Заказ №${num}</b>\n\n` +
    `👤 ${who}\n📞 ${esc(o.phone)}\n🕒 ${modeText(o.mode)}, ${whenText(o)}\n\n` +
    `${itemsText(o)}\nОплата при получении`;
  if (o.comment) text += `\n\n💬 ${esc(o.comment)}`;
  return text;
}

function ownerButtons(stage, cust, num, mode) {
  const tail = `${cust}:${num}:${mode === "pickup" ? "p" : "h"}`;
  if (stage === "new")
    return { inline_keyboard: [[
      { text: "✅ Принять", callback_data: `acc:${tail}` },
      { text: "✖️ Отклонить", callback_data: `rej:${tail}` },
    ]] };
  if (stage === "accepted")
    return { inline_keyboard: [[{ text: "🔔 Готов, позвать клиента", callback_data: `rdy:${tail}` }]] };
  return { inline_keyboard: [] };
}

async function handleOrder(msg, env, api) {
  const send = (chat_id, text, extra = {}) =>
    api("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
  const chatId = msg.chat.id;
  const num = msg.message_id;
  let o;
  try {
    o = parseOrder(msg.web_app_data && msg.web_app_data.data);
  } catch (e) {
    if (!(e instanceof BadOrder)) throw e;
    await send(chatId, `Не получилось оформить заказ: ${esc(e.message)}. Откройте меню и попробуйте ещё раз.`,
      { reply_markup: menuKeyboard(env) });
    return;
  }

  await send(chatId,
    `Спасибо, ${esc(o.name)}! Заказ <b>№${num}</b> отправлен в ШРМ.\n` +
    `${modeText(o.mode)}, ${whenText(o)}.\n\n${itemsText(o)}\nОплата при получении.\n\n` +
    `Напишем, как только заказ примут.`,
    { reply_markup: menuKeyboard(env) });

  const demo = (env.DEMO ?? "1") === "1";
  const owner = String(env.OWNER_CHAT_ID || "").trim();
  const targets = [];
  if (owner) targets.push(owner);
  if (demo && !targets.includes(String(chatId))) targets.push(String(chatId));
  const card = ownerCard(num, o, msg.from);
  for (const t of targets) {
    if (demo && t === String(chatId))
      await send(t, "👇 <i>Демо-режим: так заказ видит владелец. Нажмите кнопки под карточкой.</i>");
    await send(t, card, { reply_markup: ownerButtons("new", chatId, num, o.mode) });
  }
}

async function handleCallback(cb, env, api) {
  const send = (chat_id, text, extra = {}) =>
    api("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
  const m = /^(acc|rej|rdy):(-?\d+):(\d+):([ph])$/.exec(cb.data || "");
  const msg = cb.message;
  if (!m || !msg) { await api("answerCallbackQuery", { callback_query_id: cb.id }); return; }
  const [, action, custStr, num, modeKey] = m;
  const cust = Number(custStr);
  const mode = modeKey === "p" ? "pickup" : "here";

  const status = { acc: "✅ Принят", rej: "✖️ Отклонён", rdy: "🔔 Готов, клиент получил уведомление" }[action];
  const stage = { acc: "accepted", rej: "done", rdy: "done" }[action];
  const params = {
    chat_id: msg.chat.id, message_id: msg.message_id,
    text: `${msg.text || ""}\n\n${status}`, reply_markup: ownerButtons(stage, cust, num, mode),
  };
  if (msg.entities) params.entities = msg.entities;
  await api("editMessageText", params);
  await api("answerCallbackQuery", { callback_query_id: cb.id, text: status });

  if (action === "acc") await send(cust, `👨‍🍳 Заказ <b>№${num}</b> принят и уже готовится.`);
  else if (action === "rej")
    await send(cust, `К сожалению, заказ <b>№${num}</b> сейчас не можем приготовить. Попробуйте оформить его позже.`,
      { reply_markup: menuKeyboard(env) });
  else {
    const where = mode === "pickup" ? `Забирайте у киоска: ${ADDRESS}.` : "Подходите к стойке, приятного аппетита!";
    await send(cust, `🔥 Заказ <b>№${num}</b> готов! ${where}`);
  }
}

async function handleMessage(msg, env, api) {
  const send = (chat_id, text, extra = {}) =>
    api("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
  const chatId = msg.chat.id;
  if (msg.web_app_data) return handleOrder(msg, env, api);
  const text = (msg.text || "").trim();
  if (text.startsWith("/start")) {
    let intro =
      "🔥 <b>ШРМ — шаурма на огне</b>\n" +
      `Круглосуточно, ${ADDRESS}.\n\n` +
      "Нажмите <b>«Открыть меню»</b> внизу экрана, соберите заказ — и заберите его горячим.";
    if ((env.DEMO ?? "1") === "1")
      intro += "\n\n<i>Это демо-проект: заказы не готовятся по-настоящему. Чтобы показать работу целиком, " +
        "карточка заказа для владельца тоже придёт вам.</i>";
    await send(chatId, intro, { reply_markup: menuKeyboard(env) });
  } else if (text.startsWith("/id")) {
    await send(chatId, `ID этого чата: <code>${chatId}</code>`);
  } else {
    await send(chatId, "Меню открывается кнопкой <b>«Открыть меню»</b> внизу экрана 👇", { reply_markup: menuKeyboard(env) });
  }
}

export async function processUpdate(update, env, api) {
  if (update.message) await handleMessage(update.message, env, api);
  else if (update.callback_query) await handleCallback(update.callback_query, env, api);
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("ШРМ бот работает", { status: 200 });
    if (env.WEBHOOK_SECRET && request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET)
      return new Response("forbidden", { status: 403 });
    try {
      await processUpdate(await request.json(), env, telegram(env));
    } catch (e) {
      console.log("error", e && e.stack); // отвечаем 200, иначе Telegram будет повторять одно и то же
    }
    return new Response("ok");
  },
};
