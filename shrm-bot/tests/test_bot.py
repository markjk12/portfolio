"""Проверка бота без интернета: подменяем Telegram и смотрим, что бот отправил.
Запуск: python3 shrm-bot/tests/test_bot.py"""
import base64, json, os, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bot"))
os.environ.update(BOT_TOKEN="test", WEBHOOK_SECRET="s3cret", OWNER_CHAT_ID="999", DEMO="1")
import index as bot  # noqa: E402

CALLS = []
bot.api = lambda method, **p: CALLS.append((method, p)) or {"message_id": 1}


def event(update, secret="s3cret", b64=False):
    body = json.dumps(update)
    if b64:
        body = base64.b64encode(body.encode()).decode()
    return {"headers": {"X-Telegram-Bot-Api-Secret-Token": secret}, "body": body, "isBase64Encoded": b64}


def order_msg(data, mid=42, chat=111):
    return {"message": {"message_id": mid, "chat": {"id": chat}, "from": {"id": chat, "username": "client"},
                        "web_app_data": {"data": json.dumps(data, ensure_ascii=False)}}}


GOOD = {"v": 1, "items": [["sh_cheese", "b", 2], ["fries", "s", 1]], "mode": "pickup", "time": "asap",
        "name": "Аня <b>", "phone": "+7 913 000-00-00", "comment": "без лука"}


class T(unittest.TestCase):
    def setUp(self):
        CALLS.clear()

    def sent(self):
        return [p for m, p in CALLS if m == "sendMessage"]

    def test_menus_match(self):
        a = json.load(open(os.path.join(HERE, "..", "bot", "menu.json"), encoding="utf-8"))
        b = json.load(open(os.path.join(HERE, "..", "app", "menu.json"), encoding="utf-8"))
        self.assertEqual(a, b, "меню бота и приложения должны совпадать")

    def test_wrong_secret_rejected(self):
        r = bot.handler(event({"message": {"chat": {"id": 1}, "message_id": 1, "text": "/start"}}, secret="bad"), None)
        self.assertEqual(r["statusCode"], 403)
        self.assertEqual(CALLS, [])

    def test_start_has_menu_button(self):
        bot.handler(event({"message": {"chat": {"id": 5}, "message_id": 1, "text": "/start"}}, b64=True), None)
        m = self.sent()[0]
        self.assertIn("Открыть меню", m["text"])
        self.assertIn("web_app", m["reply_markup"]["keyboard"][0][0])

    def test_order_total_computed_on_server(self):
        data = dict(GOOD); data["total"] = 1  # подделанная сумма игнорируется
        bot.handler(event(order_msg(data)), None)
        msgs = self.sent()
        self.assertIn("1 027 ₽", msgs[0]["text"])          # 439*2 + 149
        self.assertIn("&lt;b&gt;", msgs[0]["text"])        # имя экранировано
        owner = [m for m in msgs if m["chat_id"] == "999"][0]
        self.assertIn("Заказ №42", owner["text"])
        self.assertIn("без лука", owner["text"])
        btns = owner["reply_markup"]["inline_keyboard"][0]
        self.assertEqual(btns[0]["callback_data"], "acc:111:42:p")
        # демо: карточка пришла и покупателю
        self.assertTrue(any(m["chat_id"] == "111" and "Заказ №42" in m["text"] and "reply_markup" in m and "inline_keyboard" in m["reply_markup"] for m in msgs))

    def test_bad_orders(self):
        for bad in [
            {**GOOD, "items": []},
            {**GOOD, "items": [["nope", "s", 1]]},
            {**GOOD, "items": [["fries", "b", 1]]},
            {**GOOD, "items": [["fries", "s", 0]]},
            {**GOOD, "items": [["fries", "s", 99]]},
            {**GOOD, "mode": "delivery"},
            {**GOOD, "time": "25:00"},
            {**GOOD, "phone": "123"},
            {**GOOD, "name": "  "},
        ]:
            CALLS.clear()
            bot.handler(event(order_msg(bad)), None)
            msgs = self.sent()
            self.assertEqual(len(msgs), 1, bad)
            self.assertIn("Не получилось", msgs[0]["text"])
        CALLS.clear()
        bot.handler(event({"message": {"message_id": 1, "chat": {"id": 1}, "web_app_data": {"data": "{oops"}}}), None)
        self.assertIn("Не получилось", self.sent()[0]["text"])

    def test_owner_flow(self):
        cb = {"id": "q", "data": "acc:111:42:p",
              "message": {"message_id": 7, "chat": {"id": 999}, "text": "Заказ №42", "entities": [{"type": "bold", "offset": 0, "length": 9}]}}
        bot.handler(event({"callback_query": cb}), None)
        edit = [p for m, p in CALLS if m == "editMessageText"][0]
        self.assertIn("Принят", edit["text"])
        self.assertEqual(edit["entities"][0]["type"], "bold")
        self.assertEqual(edit["reply_markup"]["inline_keyboard"][0][0]["callback_data"], "rdy:111:42:p")
        self.assertIn("принят", self.sent()[0]["text"])
        self.assertEqual(self.sent()[0]["chat_id"], 111)

        CALLS.clear()
        cb["data"] = "rdy:111:42:p"
        bot.handler(event({"callback_query": cb}), None)
        self.assertIn("Дзержинского", self.sent()[0]["text"])
        edit = [p for m, p in CALLS if m == "editMessageText"][0]
        self.assertEqual(edit["reply_markup"]["inline_keyboard"], [])

        CALLS.clear()
        cb["data"] = "rej:111:42:h"
        bot.handler(event({"callback_query": cb}), None)
        self.assertIn("не можем", self.sent()[0]["text"])

    def test_junk_callback_and_crash_safe(self):
        bot.handler(event({"callback_query": {"id": "q", "data": "evil", "message": {"chat": {"id": 1}, "message_id": 1}}}), None)
        self.assertEqual([m for m, _ in CALLS], ["answerCallbackQuery"])
        r = bot.handler({"headers": {"x-telegram-bot-api-secret-token": "s3cret"}, "body": "not json"}, None)
        self.assertEqual(r["statusCode"], 200)

    def test_id_command(self):
        bot.handler(event({"message": {"chat": {"id": 12345}, "message_id": 1, "text": "/id"}}), None)
        self.assertIn("12345", self.sent()[0]["text"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
