# Налаштування Google Sheets API

## 1. Створення Google Cloud Project

1. Перейдіть на [Google Cloud Console](https://console.cloud.google.com/)
2. Створіть новий проект або виберіть існуючий
3. Увімкніть Google Sheets API:
   - Перейдіть в "APIs & Services" > "Library"
   - Знайдіть "Google Sheets API" та увімкніть його

## 2. Створення Service Account

1. Перейдіть в "APIs & Services" > "Credentials"
2. Натисніть "Create Credentials" > "Service Account"
3. Заповніть форму:
   - Name: `land-scraper`
   - Description: `Service account for land auction scraper`
4. Натисніть "Create and Continue"
5. Пропустіть наступні кроки (ролі не потрібні)
6. Натисніть "Done"

## 3. Створення ключа

1. В списку Service Accounts знайдіть створений акаунт
2. Натисніть на email акаунта
3. Перейдіть на вкладку "Keys"
4. Натисніть "Add Key" > "Create new key"
5. Виберіть "JSON" формат
6. Натисніть "Create"
7. Файл автоматично завантажиться

## 4. Налаштування проекту

1. Перейменуйте завантажений файл в `google-credentials.json`
2. Помістіть його в корінь проекту
3. Створіть файл `.env` з наступним вмістом:

```env
# URL для скрапінгу
BASE_URL=https://ua.land/auctions?size=50&address=%D0%92%D1%96%D0%BD%D0%BD%D0%B8%D1%86%D1%8C%D0%BA%D0%B0+%D0%BE%D0%B1%D0%BB%D0%B0%D1%81%D1%82%D1%8C%2C%D0%A7%D0%B5%D1%80%D0%BA%D0%B0%D1%81%D1%8C%D0%BA%D0%B0+%D0%BE%D0%B1%D0%BB%D0%B0%D1%81%D1%82%D1%8C%2C%D0%A5%D0%BC%D0%B5%D0%BB%D1%8C%D0%BD%D0%B8%D1%86%D1%8C%D0%BA%D0%B0+%D0%BE%D0%B1%D0%BB%D0%B0%D1%81%D1%82%D1%8C%2C%D0%9F%D0%BE%D0%BB%D1%82%D0%B0%D0%B2%D1%81%D1%8C%D0%BA%D0%B0+%D0%BE%D0%B1%D0%BB%D0%B0%D1%81%D1%82%D1%8C&status=ACTIVE_TENDERING&minArea=2&procedureType=land_arrested

# Google Sheets налаштування
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
```

## 5. Створення Google Таблиці

1. Перейдіть на [Google Sheets](https://sheets.google.com/)
2. Створіть нову таблицю
3. Скопіюйте ID таблиці з URL:
   - URL виглядає як: `https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit`
   - ID: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`
4. Замініть `your_spreadsheet_id_here` в `.env` файлі на реальний ID

## 6. Надання доступу до таблиці

1. Відкрийте створену Google Таблицю
2. Натисніть "Share" (у верхньому правому куті)
3. Додайте email з Service Account (знаходиться в `google-credentials.json` в полі `client_email`)
4. Надайте права "Editor"
5. Натисніть "Send"

## 7. Запуск скрипта

```bash
npm start
```

Дані будуть автоматично збережені в Google Таблицю!
