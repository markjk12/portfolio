// Собирает dist/worker.js: подставляет меню из app/menu.json в код бота.
// Запуск: node shrm-bot/worker/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const here = new URL(".", import.meta.url);
const menu = JSON.parse(readFileSync(new URL("../app/menu.json", here), "utf8"));
const src = readFileSync(new URL("src.js", here), "utf8");
mkdirSync(new URL("../dist/", here), { recursive: true });
writeFileSync(new URL("../dist/worker.js", here), src.replace("__MENU__", JSON.stringify(menu, null, 2)));
console.log("dist/worker.js готов");
