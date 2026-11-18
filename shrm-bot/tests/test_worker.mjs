// Проверка бота без интернета: подменяем Telegram и смотрим, что бот отправил.
// Запуск: node shrm-bot/worker/build.mjs && node --test shrm-bot/tests/
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker, { parseOrder } from "../dist/worker.js";

const ENV = { BOT_TOKEN: "test", WEBHOOK_SECRET: "s3cret", OWNER_CHAT_ID: "999", DEMO: "1" };
let CALLS = [];
globalThis.fetch = async (url, opts) => {
  const method = url.split("/").pop();
  CALLS.push([method, JSON.parse(opts.body)]);
  return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
};
beforeEach(() => { CALLS = []; });

const call = (update, secret = "s3cret", env = ENV) =>
  worker.fetch(new Request("https://x/", {
    method: "POST", body: typeof update === "string" ? update : JSON.stringify(update),
    headers: { "X-Telegram-Bot-Api-Secret-Token": secret },
  }), env);
const sent = () => CALLS.filter(([m]) => m === "sendMessage").map(([, p]) => p);
const orderMsg = (data, mid = 42, chat = 111) => ({ message: {
  message_id: mid, chat: { id: chat }, from: { id: chat, username: "client" },
  web_app_data: { data: JSON.stringify(data) } } });
const GOOD = { v: 1, items: [["sh_cheese", "b", 2], ["fries", "s", 1]], mode: "pickup", time: "asap",
  name: "Аня <b>", phone: "+7 913 000-00-00", comment: "без лука" };

test("чужой запрос без секрета отклоняется", async () => {
  const r = await call({ message: { chat: { id: 1 }, message_id: 1, text: "/start" } }, "bad");
  assert.equal(r.status, 403);
  assert.equal(CALLS.length, 0);
});

test("/start показывает кнопку меню", async () => {
  await call({ message: { chat: { id: 5 }, message_id: 1, text: "/start" } });
  const m = sent()[0];
  assert.match(m.text, /Открыть меню/);
  assert.ok(m.reply_markup.keyboard[0][0].web_app.url.includes("shrm-bot/app"));
});

test("сумма считается на сервере, имя экранируется, владелец и демо получают карточку", async () => {
  await call(orderMsg({ ...GOOD, total: 1 }));
  const msgs = sent();
  assert.match(msgs[0].text, /1 027 ₽/);           // 439*2 + 149
  assert.match(msgs[0].text, /&lt;b&gt;/);
  const owner = msgs.find((m) => m.chat_id === "999");
  assert.match(owner.text, /Заказ №42/);
  assert.match(owner.text, /без лука/);
  assert.equal(owner.reply_markup.inline_keyboard[0][0].callback_data, "acc:111:42:p");
  assert.ok(msgs.some((m) => m.chat_id === "111" && /Заказ №42/.test(m.text) && m.reply_markup?.inline_keyboard));
});

test("без демо-режима карточка только владельцу", async () => {
  await call(orderMsg(GOOD), "s3cret", { ...ENV, DEMO: "0" });
  assert.equal(sent().filter((m) => m.reply_markup?.inline_keyboard).length, 1);
});

test("неправильные заказы отклоняются", async () => {
  const bad = [
    { ...GOOD, items: [] }, { ...GOOD, items: [["nope", "s", 1]] }, { ...GOOD, items: [["fries", "b", 1]] },
    { ...GOOD, items: [["fries", "s", 0]] }, { ...GOOD, items: [["fries", "s", 99]] }, { ...GOOD, items: [["fries", "s", 1.5]] },
    { ...GOOD, mode: "delivery" }, { ...GOOD, time: "25:00" }, { ...GOOD, phone: "123" }, { ...GOOD, name: "  " },
  ];
  for (const b of bad) {
    CALLS = [];
    await call(orderMsg(b));
    assert.equal(sent().length, 1, JSON.stringify(b));
    assert.match(sent()[0].text, /Не получилось/);
  }
  CALLS = [];
  await call({ message: { message_id: 1, chat: { id: 1 }, web_app_data: { data: "{oops" } } });
  assert.match(sent()[0].text, /Не получилось/);
});

test("кнопки владельца: принять → готов, отклонить", async () => {
  const cb = { id: "q", data: "acc:111:42:p", message: { message_id: 7, chat: { id: 999 }, text: "Заказ №42",
    entities: [{ type: "bold", offset: 0, length: 9 }] } };
  await call({ callback_query: cb });
  let edit = CALLS.find(([m]) => m === "editMessageText")[1];
  assert.match(edit.text, /Принят/);
  assert.equal(edit.entities[0].type, "bold");
  assert.equal(edit.reply_markup.inline_keyboard[0][0].callback_data, "rdy:111:42:p");
  assert.equal(sent()[0].chat_id, 111);
  assert.match(sent()[0].text, /принят/);

  CALLS = [];
  await call({ callback_query: { ...cb, data: "rdy:111:42:p" } });
  assert.match(sent()[0].text, /Дзержинского/);
  edit = CALLS.find(([m]) => m === "editMessageText")[1];
  assert.deepEqual(edit.reply_markup.inline_keyboard, []);

  CALLS = [];
  await call({ callback_query: { ...cb, data: "rej:111:42:h" } });
  assert.match(sent()[0].text, /не можем/);
});

test("мусорные данные не роняют бота", async () => {
  await call({ callback_query: { id: "q", data: "evil", message: { chat: { id: 1 }, message_id: 1 } } });
  assert.deepEqual(CALLS.map(([m]) => m), ["answerCallbackQuery"]);
  const r = await call("not json");
  assert.equal(r.status, 200);
  const g = await worker.fetch(new Request("https://x/"), ENV);
  assert.equal(g.status, 200);
});

test("/id возвращает номер чата", async () => {
  await call({ message: { chat: { id: 12345 }, message_id: 1, text: "/id" } });
  assert.match(sent()[0].text, /12345/);
});

test("заказ из мини-приложения (как его отправляет браузер) принимается", () => {
  const o = parseOrder('{"v":1,"items":[["sh_cheese","b",2],["fries","s",1],["mors_cherry","s",1]],"mode":"here","time":"18:30","name":"Марк","phone":"+7 913 123-45-67","comment":""}');
  assert.equal(o.total, 1166);
});
