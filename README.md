# PepperFM Nuxt Starter

Интерактивный генератор **новых** Nuxt-приложений. Сначала UI, затем модули, backend и инфраструктура. Не runtime-фреймворк поверх Nuxt: после генерации весь код принадлежит приложению.

**Bun по умолчанию — и пакетный менеджер, и production runtime.** Каждый пресет генерирует `nitro: { preset: 'bun' }`. Воркеры и systemd запускают Bun. Docker — только для локальных PostgreSQL/MySQL и Redis; примеры production-деплоя рассчитаны на обычную Ubuntu, systemd и Nginx.

## Запуск

После публикации пакета в npm можно запускать CLI без клонирования репозитория:

```sh
bunx --bun @pepper_fm/nuxt-starter@latest my-app
bunx --bun @pepper_fm/nuxt-starter@latest my-app --i18n --mdc
```

До первой публикации (или для разработки генератора) используйте исходники:

```sh
git clone https://github.com/pepperfm/nuxt-starter.git
cd nuxt-starter
bun install
bun run dev ../my-app
```

Имя npm-пакета — `@pepper_fm/nuxt-starter` (npm-пользователь `pepper_fm`); GitHub-репозиторий остаётся `pepperfm/nuxt-starter`.

### Без интерактива — для CI и агентов

```sh
bun run dev ../my-app --yes --ui nuxt-ui --i18n --mdc

# Без backend и без UI-компонентов
bun run dev ../landing --yes --ui none --backend none --modules eslint,test

# shadcn-vue + контент, без DB/очередей
bun run dev ../docs --yes --ui shadcn --backend none --modules eslint,test,content

# MySQL пока в data-пресете, без auth-рецепта
bun run dev ../catalog --yes --ui element --backend data --database mysql

# Проверить результат без записи/установки
bun run dev ../preview --yes --dry-run
```

## Шаги мастера

1. **UI:** Nuxt UI, shadcn-vue, Element Plus или без UI. Выбор взаимоисключающий.
2. **Модули:** ESLint, Vitest, i18n, MDC, Content, Image, VueUse, Pinia, Nuxt Security.
3. **Backend:** NuxtHub + Drizzle, Redis cache/KV, Better Auth, BullMQ + расписания. Необходимые зависимости добавляются автоматически.
4. **Инфраструктура:** Bun по умолчанию; можно выбрать другой установщик пакетов, но Nitro runtime остаётся Bun. Локальный Compose и Ubuntu-примеры независимы.
5. **Каталог и подтверждение:** генерация, отдельный `.env` с уникальным dev-secret, установка зависимостей, `git init` без автоматического коммита.

Приоритет — модулям команды Nuxt/Nuxt Community. shadcn-vue и Element Plus поддерживаются своими командами; Better Auth и BullMQ — самостоятельные библиотеки, а не «официальный Laravel для Nuxt».

## Backend-пресеты

| Пресет | Что включено |
|---|---|
| `fullstack` — default | PostgreSQL, Drizzle/NuxtHub, два Redis, auth, сессии, очереди, cron |
| `data` | PostgreSQL или MySQL, Drizzle/NuxtHub, Redis cache/KV |
| `none` | Только Nuxt/Nitro и выбранный frontend |

`--features hub,redis,auth,queue` переопределяет пресет. Auth добавляет hub + Redis, очередь добавляет Redis. MySQL + auth пока отклоняется явно: не генерируем видимость поддержки непроверенной комбинации.

### Что уже реализовано

Авторизация: регистрация, вход, выход, защищённый серверный `/api/me`, middleware страниц, экран активных сессий и отзыв другого устройства. Better Auth подключён напрямую, с официальным `@better-auth/redis-storage`; нет собственного криптографического или session протокола.

Сессии хранятся в Redis, `storeSessionInDatabase: false`, cookie-cache выключен. Очистка durable Redis разлогинивает пользователей. Нет неочевидного восстановления отозванной сессии из SQL. Серверный SSR payload не содержит session token; список устройств с токенами отзыва загружается только авторизованным клиентом.

Кэш и KV подключаются через Nitro/Unstorage **во время запуска**, по `NUXT_REDIS_CACHE_URL` и `NUXT_REDIS_STATE_URL`. NuxtHub отвечает за БД; не дублируем его cache/KV поверх собственных mounts. Это сознательная интеграция, не обещание, что `hub.cache: true` сам найдёт Redis.

Очередь: отдельный Bun worker, валидация payload, retries/backoff в demo, graceful shutdown, идемпотентная регистрация BullMQ Job Schedulers. Настоящие внешние эффекты требуют доменной идемпотентности: очередь — at-least-once.

### Что НЕ готово «из коробки»

Email verification/reset с доставкой писем, OAuth-провайдеры, роли и продуктовые policies, биллинг, Bull Board, S3, websockets, мониторинг, production-secrets и автоматическое разворачивание сервера. Они не маскируются пустыми чекбоксами. Примеры auth UI пока на английском; i18n демонстрирует ru/en и переключение локали, но не обещает полный перевод приложения.

Это стартовая основа, не автоматически production-ready продукт. Перед публичным запуском настройте восстановление доступа/verification, SMTP, HTTPS, бэкапы, защиту бизнес-API и мониторинг.

## Параметры

См. `bun run dev --help`. Полезные: `--no-install`, `--no-git`, `--no-docker`, `--no-deploy`, `--locales ru,en`, `--modules ''`, `--features ''`.

Генератор никогда не перезаписывает существующий каталог, не запускает миграции и не поднимает Docker автоматически. При ошибке установки файлы сохраняются. `.env` имеет права 0600 и исключён из Git; `.env.example` не содержит сгенерированный secret.

## Публикация в npm

**Изменения в `master` не публикуются автоматически.** Обычный CI выполняет тесты. Публикацию запускает только **опубликованный стабильный GitHub Release**, причём после повторных проверок генератора и smoke-сценариев. Pre-release не публикуется.

### Однократная настройка

Если `@pepper_fm/nuxt-starter` ещё не существует в npm, сначала один раз опубликуйте `0.1.0` вручную из обновлённого `master`:

```sh
git pull
npm whoami                  # должно быть pepper_fm
npm pack --dry-run
npm publish --access public
```

Если версия `0.1.0` **уже опубликована**, не публикуйте её повторно: npm запрещает повторную публикацию одинаковой версии.

Затем в **npmjs.com → Packages → @pepper_fm/nuxt-starter → Settings → Trusted publishing** добавьте GitHub Actions publisher:

| Поле | Значение |
|---|---|
| Organization or user | `pepperfm` |
| Repository | `nuxt-starter` |
| Workflow filename | `publish.yml` |
| Environment name | оставить пустым |
| Allowed actions | **Allow `npm publish`** (нужно отметить явно) |

Workflow `.github/workflows/publish.yml` использует npm Trusted Publishing через OIDC (`id-token: write`): не нужны `NPM_TOKEN` и другие долгоживущие токены. Важно: новую настройку Trusted Publisher требуется подтвердить первой успешной публикацией из CI в течение **двух дней**, иначе её придётся создать заново. Документация: https://docs.npmjs.com/trusted-publishers/.

### Следующий релиз

Увеличьте версию в `package.json`, закоммитьте и отправьте её в `master`, после чего опубликуйте GitHub Release с совпадающим тегом `vX.Y.Z`:

```sh
npm version patch --no-git-tag-version
git add package.json
git commit -m "chore: bump package version"
git push origin master
gh release create "v$(node -p 'require("./package.json").version')" --target master --generate-notes
```

Проверки релиза должны пройти успешно. Затем workflow сверит тег с `package.json` и выполнит `npm publish --access public` в npm под `@pepper_fm/nuxt-starter`. Если версия уже существует в npm, она не может быть опубликована повторно. Никакой публикации после обычного `git push` нет.

## После генерации

```sh
cd ../my-app
bun run services:up      # локальные сервисы; только если выбраны
bun run db:generate      # сгенерировать, просмотреть и закоммитить миграции
bun run db:migrate
bun run dev

# отдельно
bun run worker
bun run queue:demo
bun run schedule:register
```

На сервере применяйте **уже закоммиченные** миграции, не генерируйте их. Production-миграции отключены во время build. Коммитьте `bun.lock` после первой установки. Сгенерированный CI использует Bun и `--frozen-lockfile`; при выборе npm/pnpm адаптируйте workflow под свой lockfile, runtime остаётся Bun.

## Разработка генератора и проверки

```sh
bun install
bun run check
bun run test
bun run test:smoke nuxt-ui
```

`check` дополнительно использует Node 22 для независимой проверки JS-синтаксиса. Runtime приложений от этого не меняется. Unit-тесты также можно запустить локально через `node --test test/*.test.mjs`.

CI проверяет генератор и семь реальных сценариев: четыре UI, Content, PostgreSQL fullstack, MySQL data. Каждый сценарий устанавливает зависимости, запускает typecheck и unit-тесты, проверяет линтинг, собирает и запускает **Nitro Bun**. Fullstack-сценарий дополнительно проверяет SQL-миграции, вход/выход, два устройства, отзыв сессии, проверку Origin, отдельный worker и scheduler. Изолированные GitHub CI services используют контейнеры; production-примеры Docker не используют.

Unit render-matrix проверяет 132 сочетания настроек. Это не равнозначно 132 полноценным браузерным E2E-тестам. Браузерная проверка интерактивных UI-компонентов и исчерпывающий аудит production-безопасности остаются отдельной работой.

## Структура

- `bin/starter.mjs` — CLI, lazy-load интерактива.
- `src/options.mjs` — флаги, проверки, зависимости между возможностями.
- `src/prompts.mjs` — пошаговый Clack UI.
- `src/recipes/` — UI, модули, БД, auth, queues, infra.
- `src/generator.mjs` — чистая сборка плана + безопасная запись.
- `src/catalog.mjs` — поддерживаемые package ranges; generated lockfile фиксирует конкретные версии.
- `test/` — unit/file-system/CLI проверки.
- `scripts/smoke.mjs` — интеграционная проверка с Bun/БД/Redis.

Новый рецепт должен добавлять не только зависимость, но и конфиг, рабочий пример и тест. Не создавайте свой DI-контейнер или клоны всех Laravel-хелперов ради похожего синтаксиса.

## Документация upstream

- Nitro Bun: https://nitro.build/deploy/runtimes/bun
- NuxtHub DB: https://hub.nuxt.com/docs/database
- Better Auth / Redis: https://better-auth.com/docs/concepts/database
- Better Auth / Nuxt: https://better-auth.com/docs/integrations/nuxt
- BullMQ Job Schedulers: https://docs.bullmq.io/guide/job-schedulers
- Nuxt UI: https://ui.nuxt.com/docs/getting-started/installation/nuxt
- shadcn-vue: https://www.shadcn-vue.com/docs/installation/nuxt
- Element Plus: https://element-plus.org/en-US/guide/quickstart.html

MIT.
