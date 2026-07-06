# SKILL: browser-extension-dev — конвенции проекта `aiBrowserPlagin`

Конкретные конвенции **именно этого проекта** для написания кода расширения. Это
не общий гайд по Manifest V3, а специфика `aiBrowserPlagin`. Применяй при
реализации любого этапа. Опорные документы:
[`../../../docs/TECHNICAL_PLAN.md`](../../../docs/TECHNICAL_PLAN.md),
[`../../../docs/PLAN.md`](../../../docs/PLAN.md).

---

## 1. Три контекста и message-passing

Расширение живёт в **трёх изолированных мирах**: content script (в DOM
страницы), background service worker, popup/side panel. Прямых вызовов между
ними нет — **только `chrome.runtime` / `chrome.tabs` message-passing**.

- **Единый типизированный контракт сообщений — `src/lib/messages.ts`.** Любое
  новое сообщение добавляется туда как discriminated union по полю `type`. Не
  плодить строковые литералы по контекстам — это источник рассинхрона.
- Каналы:
  - popup → content: `chrome.tabs.sendMessage(tabId, msg)` (извлечь текст).
  - popup/content → background: `chrome.runtime.sendMessage(msg)` (саммаризация).
- **content script — тонкий:** извлекает текст, отдаёт наверх. Никакой
  LLM-логики и секретов в нём.

## 2. Жизненный цикл service worker (MV3) — критично

Worker **эфемерный**: выгружается при простое, будится на событие. Отсюда:

- **Регистрируй все слушатели синхронно на верхнем уровне модуля**
  (`chrome.runtime.onMessage.addListener(...)` в топ-скоупе), **не** внутри
  async-колбэков/промисов. Иначе после пробуждения worker слушатель не
  привяжется и событие потеряется.
- **Не держи важное состояние в module-level переменных** — оно не переживёт
  выгрузку. Настройки, кэш, история — в `chrome.storage`.
- В `onMessage` при **асинхронном** ответе обязательно **`return true`** из
  слушателя, чтобы канал `sendResponse` не закрылся до резолва промиса.
  (Синхронный ответ — `return undefined`.)

Антипаттерн: `setInterval`/таймеры, рассчитанные на «живой» worker, — не
работают надёжно; для отложенной работы — `chrome.alarms`.

## 3. Настройки и BYOK — `chrome.storage`, ключ не утекает

- Все настройки (base URL, ключ, модель) — через `src/lib/settings.ts`
  (`loadSettings`/`saveSettings`), хранилище — `chrome.storage.local`.
- **BYOK-инвариант (жёсткий):**
  - ключ пользователя **никогда** не хардкодится в коде;
  - **никогда** не логируется (`console.*`) — ни целиком, ни частично;
  - **никогда** не коммитится в git (нет ключей в репозитории, `.env*` в
    `.gitignore`);
  - живёт только в runtime-storage браузера, читается в момент вызова LLM и не
    кэшируется в module-level переменных.
- Локально ключ вводить в UI настроек — свободно; это runtime браузера, не диск
  проекта.

## 4. LLM-вызов (service worker)

- Прямой `fetch` к `POST {baseUrl}/chat/completions` (OpenAI-совместимо), без
  SDK — тренировка ручного HTTP.
- `Authorization: Bearer <apiKey>` — ключ из `loadSettings()` прямо перед
  запросом.
- Таймаут/отмена — через `AbortController`. Обработка ошибок: 401 → «проверьте
  ключ», 429 → «лимит», сеть/таймаут → понятное сообщение. Не глотать ошибку
  молча — вернуть `SUMMARIZE_RESULT{ ok:false, error }`.
- Длинный вход — усечение под потолок токенов (Этап 3).

## 5. PDF через `pdf.js` (Этап 4)

- Зависимость `pdfjs-dist`. Детект PDF: URL `.pdf` / `content-type:
  application/pdf` / встроенный вьюер браузера.
- Извлечение: загрузить документ, пройти страницы, собрать `textContent` в
  единый текст → обычный поток саммаризации.
- **Воркер pdf.js** подключать как отдельный ассет сборки (Vite `?url` +
  `web_accessible_resources`), а не инлайнить; иначе MV3 CSP заблокирует.

## 6. Манифест и разрешения

- Манифест — типизированный `manifest.config.ts` (`defineManifest`), **источник
  версии из `package.json`** и путей. Не редактировать сгенерированный
  `dist/manifest.json` руками.
- **Минимум разрешений.** Сейчас `activeTab` + `storage` (+ `scripting` как
  fallback). Новое разрешение/`host_permissions` добавлять только при реальной
  необходимости и фиксировать причину в `docs/TECHNICAL_PLAN.md`.

## 7. Сборка и типы

- `npm run build` = `tsc --noEmit` (strict) + `vite build`. Должна быть зелёной
  начиная с Этапа 0 — не мержить красную сборку.
- `tsconfig` strict + `noUnusedLocals/Parameters`; типы `chrome` и `vite/client`.
- Импорты внутри `src/` — с расширением `.ts` (bundler-resolution + @crxjs).
