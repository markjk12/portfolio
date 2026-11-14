"""
Демо-бот заказов для шаурмичной (Telegram + Mini App).
Работает как функция в Яндекс Облаке: Telegram присылает сюда каждое
сообщение (webhook), функция отвечает и завершается. Ничего не хранит:
корзина собирается в мини-приложении, а данные заказа живут в самих
сообщениях Telegram.

Настройки (переменные окружения функции):
  BOT_TOKEN       — ключ бота от @BotFather (обязательно)
  WEBHOOK_SECRET  — любая длинная строка; та же, что при установке webhook
  OWNER_CHAT_ID   — куда присылать заказы (узнать: команда /id в боте)
  APP_URL         — адрес мини-приложения с меню
  DEMO            — "1": карточка заказа приходит и самому покупателю,
                    чтобы любой мог увидеть, как это выглядит у владельца
"""
import base64
import html
import json
import os
import re
import urllib.request

TOKEN = os.environ.get("BOT_TOKEN", "")
SECRET = os.environ.get("WEBHOOK_SECRET", "")
OWNER = os.environ.get("OWNER_CHAT_ID", "").strip()
APP_URL = os.environ.get("APP_URL", "https://markjk12.github.io/portfolio/shrm-bot/app/")
DEMO = os.environ.get("DEMO", "1") == "1"

ADDRESS = "проспект Дзержинского, 2/2 (киоск у ТЦ «Роща»)"

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "menu.json"), encoding="utf-8") as f:
    MENU = json.load(f)
ITEMS = {i["id"]: i for i in MENU["items"]}


# ---------- Telegram ----------

def api(method, **params):
    """Вызов Telegram Bot API. В тестах подменяется."""
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TOKEN}/{method}",
        data=json.dumps(params).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read().decode("utf-8")).get("result")


def send(chat_id, text, **extra):
    return api("sendMessage", chat_id=chat_id, text=text, parse_mode="HTML",
               disable_web_page_preview=True, **extra)


def rub(n):
    return f"{n:,}".replace(",", " ") + " ₽"


def esc(s):
    return html.escape(str(s), quote=False)


MENU_KEYBOARD = {
    "keyboard": [[{"text": "🌯 Открыть меню", "web_app": {"url": APP_URL}}]],
    "resize_keyboard": True,
    "is_persistent": True,
}


# ---------- Заказ ----------

class BadOrder(Exception):
    pass


def parse_order(raw):
    """Проверяет данные из мини-приложения и считает сумму заново по своему меню:
    цены, присланные с телефона, не используются."""
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        raise BadOrder("не удалось прочитать заказ")
    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        raise BadOrder("пустой заказ")

    lines, total, count = [], 0, 0
    for row in data["items"][:30]:
        if not (isinstance(row, list) and len(row) == 3):
            raise BadOrder("ошибка в позиции")
        item_id, size_id, qty = row
        item = ITEMS.get(item_id)
        size = next((s for s in item["sizes"] if s["id"] == size_id), None) if item else None
        if not size or not isinstance(qty, int) or not 1 <= qty <= 20:
            raise BadOrder("ошибка в позиции")
        name = item["title"] + (f", {size['title'].lower()}" if size["title"] else "")
        lines.append((name, qty, size["price"] * qty))
        total += size["price"] * qty
        count += qty
    if not lines:
        raise BadOrder("пустой заказ")

    mode = data.get("mode")
    if mode not in ("pickup", "here"):
        raise BadOrder("не выбран способ получения")
    time = data.get("time")
    if time != "asap" and not (isinstance(time, str) and re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", time)):
        raise BadOrder("неверное время")

    name = str(data.get("name", "")).strip()[:40]
    phone = re.sub(r"[^\d+]", "", str(data.get("phone", "")))[:16]
    if not name or len(re.sub(r"\D", "", phone)) < 10:
        raise BadOrder("нужны имя и телефон")
    comment = str(data.get("comment", "")).strip()[:200]

    return {"lines": lines, "total": total, "count": count, "mode": mode, "time": time,
            "name": name, "phone": phone, "comment": comment}


def when_text(order):
    return "как можно скорее" if order["time"] == "asap" else f"к {order['time']}"


def mode_text(mode):
    return "Самовывоз" if mode == "pickup" else "Поест на месте"


def items_text(order):
    rows = [f"• {esc(n)} × {q} — {rub(s)}" for n, q, s in order["lines"]]
    return "\n".join(rows) + f"\n\n<b>Итого: {rub(order['total'])}</b>"


def owner_card(num, order, user):
    who = esc(order["name"])
    if user.get("username"):
        who += f" (@{esc(user['username'])})"
    text = (
        f"🆕 <b>Заказ №{num}</b>\n\n"
        f"👤 {who}\n"
        f"📞 {esc(order['phone'])}\n"
        f"🕒 {mode_text(order['mode'])}, {when_text(order)}\n\n"
        f"{items_text(order)}\n"
        f"Оплата при получении"
    )
    if order["comment"]:
        text += f"\n\n💬 {esc(order['comment'])}"
    return text


def owner_buttons(stage, cust, num, mode):
    tail = f"{cust}:{num}:{'p' if mode == 'pickup' else 'h'}"
    if stage == "new":
        return {"inline_keyboard": [[
            {"text": "✅ Принять", "callback_data": f"acc:{tail}"},
            {"text": "✖️ Отклонить", "callback_data": f"rej:{tail}"},
        ]]}
    if stage == "accepted":
        return {"inline_keyboard": [[{"text": "🔔 Готов, позвать клиента", "callback_data": f"rdy:{tail}"}]]}
    return {"inline_keyboard": []}


def handle_order(msg):
    chat_id = msg["chat"]["id"]
    user = msg.get("from", {})
    num = msg["message_id"]
    try:
        order = parse_order(msg["web_app_data"].get("data"))
    except BadOrder as e:
        send(chat_id, f"Не получилось оформить заказ: {esc(e)}. Откройте меню и попробуйте ещё раз.",
             reply_markup=MENU_KEYBOARD)
        return

    send(chat_id,
         f"Спасибо, {esc(order['name'])}! Заказ <b>№{num}</b> отправлен в ШРМ.\n"
         f"{mode_text(order['mode'])}, {when_text(order)}.\n\n"
         f"{items_text(order)}\nОплата при получении.\n\n"
         f"Напишем, как только заказ примут.",
         reply_markup=MENU_KEYBOARD)

    targets = []
    if OWNER:
        targets.append(OWNER)
    if DEMO and str(chat_id) not in targets:
        targets.append(str(chat_id))
    card = owner_card(num, order, user)
    for t in targets:
        if DEMO and t == str(chat_id):
            send(t, "👇 <i>Демо-режим: так заказ видит владелец. Нажмите кнопки под карточкой.</i>")
        send(t, card, reply_markup=owner_buttons("new", chat_id, num, order["mode"]))


def handle_callback(cb):
    data = cb.get("data", "")
    m = re.fullmatch(r"(acc|rej|rdy):(-?\d+):(\d+):([ph])", data)
    msg = cb.get("message")
    if not m or not msg:
        api("answerCallbackQuery", callback_query_id=cb["id"])
        return
    action, cust, num, mode = m.group(1), int(m.group(2)), m.group(3), m.group(4)
    mode = "pickup" if mode == "p" else "here"

    status = {"acc": "✅ Принят", "rej": "✖️ Отклонён", "rdy": "🔔 Готов, клиент получил уведомление"}[action]
    stage = {"acc": "accepted", "rej": "done", "rdy": "done"}[action]
    text = msg.get("text", "")
    params = {"chat_id": msg["chat"]["id"], "message_id": msg["message_id"],
              "text": f"{text}\n\n{status}", "reply_markup": owner_buttons(stage, cust, num, mode)}
    if msg.get("entities"):
        params["entities"] = msg["entities"]
    api("editMessageText", **params)
    api("answerCallbackQuery", callback_query_id=cb["id"], text=status)

    if action == "acc":
        send(cust, f"👨‍🍳 Заказ <b>№{num}</b> принят и уже готовится.")
    elif action == "rej":
        send(cust, f"К сожалению, заказ <b>№{num}</b> сейчас не можем приготовить. "
                   f"Попробуйте оформить его позже.", reply_markup=MENU_KEYBOARD)
    else:
        where = f"Забирайте у киоска: {ADDRESS}." if mode == "pickup" else "Подходите к стойке, приятного аппетита!"
        send(cust, f"🔥 Заказ <b>№{num}</b> готов! {where}")


def handle_message(msg):
    chat_id = msg["chat"]["id"]
    if "web_app_data" in msg:
        handle_order(msg)
        return
    text = (msg.get("text") or "").strip()
    if text.startswith("/start"):
        intro = ("🔥 <b>ШРМ — шаурма на огне</b>\n"
                 f"Круглосуточно, {ADDRESS}.\n\n"
                 "Нажмите <b>«Открыть меню»</b> внизу экрана, соберите заказ — "
                 "и заберите его горячим.")
        if DEMO:
            intro += ("\n\n<i>Это демо-проект: заказы не готовятся по-настоящему. "
                      "Чтобы показать работу целиком, карточка заказа для владельца "
                      "тоже придёт вам.</i>")
        send(chat_id, intro, reply_markup=MENU_KEYBOARD)
    elif text.startswith("/id"):
        send(chat_id, f"ID этого чата: <code>{chat_id}</code>")
    else:
        send(chat_id, "Меню открывается кнопкой <b>«Открыть меню»</b> внизу экрана 👇",
             reply_markup=MENU_KEYBOARD)


def process(update):
    if "message" in update:
        handle_message(update["message"])
    elif "callback_query" in update:
        handle_callback(update["callback_query"])


# ---------- Точка входа для Яндекс Облака ----------

def handler(event, context):
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    if SECRET and headers.get("x-telegram-bot-api-secret-token") != SECRET:
        return {"statusCode": 403, "body": "forbidden"}
    body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")
    try:
        process(json.loads(body))
    except Exception as e:  # отвечаем 200, иначе Telegram будет повторять одно и то же
        print("error:", repr(e))
    return {"statusCode": 200, "body": "ok"}
