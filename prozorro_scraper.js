
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

let BASE_URL = process.env.PROZORRO_BASE_URL; // буде оновлено з Google таблиці

// Налаштування Google Sheets API
function getGoogleSheets() {
    const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || './google-credentials.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    return google.sheets({ version: 'v4', auth });
}

async function getBaseUrlFromGoogleSheet() {
    try {
        const sheets = getGoogleSheets();
        const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'змінні!B6',
        });
        
        if (response.data.values && response.data.values[0] && response.data.values[0][0]) {
            const baseUrl = response.data.values[0][0].trim();
            console.log(`📋 Отримано PROZORRO_BASE_URL з Google таблиці: ${baseUrl}`);
            return baseUrl;
        } else {
            console.log('⚠️ Не знайдено PROZORRO_BASE_URL в клітинці змінні!B6, використовую з .env');
            return process.env.PROZORRO_BASE_URL;
        }
    } catch (error) {
        console.log('⚠️ Помилка отримання PROZORRO_BASE_URL з Google таблиці, використовую з .env:', error.message);
        return process.env.PROZORRO_BASE_URL;
    }
}

async function getStopWordsFromGoogleSheet() {
    try {
        const sheets = getGoogleSheets();
        const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'змінні!B1',
        });
        
        if (response.data.values && response.data.values[0] && response.data.values[0][0]) {
            const stopWordsText = response.data.values[0][0].trim();
            console.log(`📋 Отримано стоп-слова з Google таблиці: ${stopWordsText}`);
            
            // Розбиваємо по комах і очищаємо від пробілів
            const stopWords = stopWordsText.split(',').map(word => word.trim().toLowerCase());
            console.log(`📝 Стоп-слова для фільтрації: ${stopWords.join(', ')}`);
            return stopWords;
        } else {
            console.log('⚠️ Не знайдено стоп-слова в клітинці змінні!B1');
            return []; // Повертаємо порожній масив
        }
    } catch (error) {
        console.log('⚠️ Помилка отримання стоп-слів з Google таблиці:', error.message);
        return []; // Повертаємо порожній масив
    }
}

async function getAuctionLinks(page) {
    console.log('🔍 Шукаю товари на поточній сторінці...');
    
    try {
        // Очікуємо завантаження посилань
        await page.waitForSelector('.search-card__content a', { timeout: 10000 });
        
        // Збираємо всі посилання на товари
        const links = await page.$$eval('.search-card__content a', (elements) => {
            return elements.map(el => el.href);
        });
        
        console.log(`✅ Знайдено ${links.length} посилань на товари на поточній сторінці`);
        return links;
        
    } catch (error) {
        console.log('⚠️ Помилка при пошуку посилань:', error.message);
        return [];
    }
}

async function hasNextPage(page, currentPage) {
    try {
        // Перевіряємо, чи є аукціони на поточній сторінці
        const links = await getAuctionLinks(page);
        return links.length > 0;
    } catch (error) {
        console.log('⚠️ Помилка при перевірці наявності наступної сторінки:', error.message);
        return false;
    }
}

function buildPageUrl(baseUrl, pageNumber) {
    if (pageNumber === 1) {
        return baseUrl;
    }
    // Перевіряємо, чи в URL вже є параметри
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}page=${pageNumber}`;
}

async function goToNextPage(page, currentPage, baseUrl) {
    try {
        const nextPage = currentPage + 1;
        const nextPageUrl = buildPageUrl(baseUrl, nextPage);
        console.log(`📍 Переходжу на сторінку ${nextPage}: ${nextPageUrl}`);
        
        await page.goto(nextPageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        return true;
    } catch (error) {
        console.log('⚠️ Помилка при переході на наступну сторінку:', error.message);
        return false;
    }
}

async function getAuctionResults(page, auctionUrl) {
    console.log(`🔍 Збираю результати аукціону з auction.prozorro.sale...`);
    
    try {
        // Конвертуємо URL з prozorro.sale на auction.prozorro.sale
        const auctionResultsUrl = auctionUrl.replace('https://prozorro.sale/auction/', 'https://auction.prozorro.sale/');
        console.log(`📍 Переходжу на результати аукціону: ${auctionResultsUrl}`);
        
        await page.goto(auctionResultsUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Додаткове очікування для повного завантаження
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Збираємо результати аукціону
        const auctionResults = await page.evaluate(() => {
            try {
                const results = {
                    participantsCount: 'Не знайдено',
                    finalPrice: 'Не знайдено',
                    winner: 'Не знайдено',
                    winnerId: 'Не знайдено',
                    priceIncreasePercent: 'Не знайдено',
                    preferentialRight: 'Не знайдено'
                };
                
                // Кількість учасників
                const participantsElement = document.querySelector('.clarification__number-of-participants');
                if (participantsElement) {
                    const countSpan = participantsElement.querySelector('span:last-child');
                    if (countSpan) {
                        results.participantsCount = countSpan.textContent.trim();
                    }
                }
                
                // Результати аукціону
                const winnerElement = document.querySelector('.results.is-winner');
                if (winnerElement) {
                    // Фінальна вартість
                    const finalPriceElement = winnerElement.querySelector('.results__sum');
                    if (finalPriceElement) {
                        const priceText = finalPriceElement.textContent.trim();
                        // Видаляємо всі символи крім цифр, крапки та коми, замінюємо кому на крапку
                        results.finalPrice = priceText.replace(/[^\d.,]/g, '').replace(',', '.');
                    }
                    
                    // Переможець
                    const winnerTextElement = winnerElement.querySelector('.results__text');
                    if (winnerTextElement) {
                        const winnerText = winnerTextElement.textContent.trim();
                        // Витягуємо ПІБ (все до номера в дужках)
                        const nameMatch = winnerText.match(/^([^(]+?)\s*\(/);
                        if (nameMatch) {
                            results.winner = nameMatch[1].trim();
                        } else {
                            results.winner = winnerText;
                        }
                        
                        // Витягуємо ідентифікатор
                        const idMatch = winnerText.match(/\(#(\d+)\)/);
                        if (idMatch) {
                            results.winnerId = idMatch[1];
                        }
                    }
                }
                
                // Відсоток зростання ціни буде розрахований формулою в Google Таблиці
                
                // Переважне право - шукаємо в результатах аукціону
                const winnerResultsElement = document.querySelector('.results.is-winner');
                if (winnerResultsElement) {
                    // Перевіряємо, чи є у переможця переважне право
                    const priorityBidder = winnerResultsElement.querySelector('.results__priority-bidder');
                    if (priorityBidder) {
                        results.preferentialRight = 'Зробив максимальну пропозицію';
                    } else {
                        // Шукаємо інформацію про відсутність переважного права
                        const priorityStep = document.querySelector('.priority-step');
                        if (priorityStep) {
                            const priorityText = priorityStep.textContent.trim();
                            if (priorityText.includes('був відсутній')) {
                                results.preferentialRight = 'Був відсутній';
                            } else if (priorityText.includes('не скористався')) {
                                results.preferentialRight = 'Не скористався';
                            } else {
                                results.preferentialRight = priorityText;
                            }
                        }
                    }
                }
                
                return results;
            } catch (error) {
                console.error('Помилка в page.evaluate для результатів аукціону:', error);
                return { error: error.message };
            }
        });
        
        if (auctionResults.error) {
            console.log(`❌ Помилка при зборі результатів аукціону: ${auctionResults.error}`);
            return {
                participantsCount: 'Не знайдено',
                finalPrice: 'Не знайдено',
                winner: 'Не знайдено',
                winnerId: 'Не знайдено',
                priceIncreasePercent: 'Не знайдено',
                preferentialRight: 'Не знайдено'
            };
        }
        
        // Скорочуємо значення переважного права
        auctionResults.preferentialRight = shortenPreferentialRight(auctionResults.preferentialRight);
        
        console.log(`✅ Зібрано результати аукціону:`);
        console.log(`  Кількість учасників: ${auctionResults.participantsCount}`);
        console.log(`  Фінальна вартість: ${auctionResults.finalPrice}`);
        console.log(`  Переможець: ${auctionResults.winner}`);
        console.log(`  ID переможця: ${auctionResults.winnerId}`);
        console.log(`  Відсоток зростання ціни: ${auctionResults.priceIncreasePercent}%`);
        console.log(`  Переважне право: ${auctionResults.preferentialRight}`);
        
        return auctionResults;
        
    } catch (error) {
        console.error(`❌ Помилка при зборі результатів аукціону:`, error.message);
        return {
            participantsCount: 'Не знайдено',
            finalPrice: 'Не знайдено',
            winner: 'Не знайдено',
            winnerId: 'Не знайдено',
            priceIncreasePercent: 'Не знайдено',
            preferentialRight: 'Не знайдено'
        };
    }
}

async function getAuctionDetailsFromUaLand(page, auctionUrl) {
    console.log(`🔍 Шукаю додаткові дані на ua.land...`);
    
    try {
        // Конвертуємо URL з prozorro.sale на ua.land
        const uaLandUrl = auctionUrl.replace('https://prozorro.sale/auction/', 'https://ua.land/auctions/');
        console.log(`📍 Переходжу на: ${uaLandUrl}`);
        
        await page.goto(uaLandUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Додаткове очікування для повного завантаження
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Розкриваємо всі accordion елементи
        console.log(`🔍 Розкриваю всі accordion елементи...`);
        try {
            const accordionSelector = '.MuiAccordion-root .MuiAccordionSummary-root';
            await page.waitForSelector(accordionSelector, { timeout: 10000 });
            
            // Отримуємо кількість accordion елементів
            const accordionCount = await page.evaluate(() => {
                return document.querySelectorAll('.MuiAccordion-root .MuiAccordionSummary-root').length;
            });
            
            console.log(`  Знайдено ${accordionCount} accordion елементів`);
            
            // Розкриваємо всі accordion елементи через JavaScript
            await page.evaluate(() => {
                const accordions = document.querySelectorAll('.MuiAccordion-root');
                accordions.forEach(accordion => {
                    const summary = accordion.querySelector('.MuiAccordionSummary-root');
                    if (summary && !accordion.classList.contains('Mui-expanded')) {
                        summary.click();
                    }
                });
            });
            
            console.log('  ✅ Всі accordion елементи розкрито через JavaScript');
            
            // Очікуємо повного розкриття
            await new Promise(resolve => setTimeout(resolve, 3000));
            console.log('✅ Всі accordion елементи розкрито');
            
        } catch (accordionError) {
            console.log(`⚠️ Помилка при розкритті accordion елементів: ${accordionError.message}`);
        }
        
        // Додаткове очікування для JavaScript
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Збираємо детальну інформацію використовуючи логіку з test_ua_land.js
        const additionalDetails = await page.evaluate(() => {
            try {
                const results = {
                    // Основні дані
                    lotDescription: 'Не знайдено',
                    area: 'Не знайдено',
                    startPrice: 'Не знайдено',
                    normativePrice: 'Не знайдено',
                    expertPrice: 'Не знайдено',
                    cadastralNumber: 'Не знайдено',
                    region: 'Не знайдено',
                    settlement: 'Не знайдено',
                    organizationName: 'Не знайдено',
                    contactPerson: 'Не знайдено',
                    phoneNumber: 'Не знайдено',
                    auctionDate: 'Не знайдено',
                    proposalPeriod: 'Не знайдено',
                    propertyClassifier: 'Не знайдено',
                    lotExhibitedBy: 'Не знайдено',
                    coordinates: 'Не знайдено',
                    koatuu: 'Не знайдено',
                    postalCode: 'Не знайдено'
                };
                
                // Отримуємо всі h6 елементи один раз
                const allH6Elements = document.querySelectorAll('h6');
                
                // Опис лоту
                const lotDescElement = document.querySelector('.MuiGrid-spacing-xs-3 div:nth-of-type(3) div.MuiAccordionDetails-root');
                if (lotDescElement && lotDescElement.textContent.trim()) {
                    results.lotDescription = lotDescElement.textContent.trim();
                }
                
                // Площа земельної ділянки, га
                let areaElement = null;
                
                // Варіант 1: div:nth-of-type(4) h5
                areaElement = document.querySelector('div:nth-of-type(4) h5');
                if (!areaElement || !areaElement.textContent.trim()) {
                    // Варіант 2: шукаємо в основному контейнері
                    const mainContainer = document.querySelector('main') || document.querySelector('.MuiContainer-root') || document.body;
                    areaElement = mainContainer.querySelector('div:nth-of-type(4) h5');
                }
                if (!areaElement || !areaElement.textContent.trim()) {
                    // Варіант 3: шукаємо серед всіх h5 з числовим значенням
                    const allH5 = document.querySelectorAll('h5');
                    for (const h5 of allH5) {
                        const text = h5.textContent.trim();
                        if (text && /^\d+\.?\d*$/.test(text)) { // Числове значення
                            areaElement = h5;
                    break;
                        }
                    }
                }
                
                if (areaElement && areaElement.textContent.trim()) {
                    results.area = areaElement.textContent.trim();
                }
                
                // Стартова ціна
                const startPriceElement = document.querySelector('h3.MuiTypography-colorPrimary');
                if (startPriceElement && startPriceElement.textContent.trim()) {
                    const priceText = startPriceElement.textContent.trim();
                    // Видаляємо всі символи крім цифр, крапки та коми
                    results.startPrice = priceText.replace(/[^\d.,]/g, '');
                }
                
                // Нормативна грошова оцінка, грн - шукаємо за текстом заголовка
                for (const h6 of allH6Elements) {
                    const text = h6.textContent.trim();
                    if (text === 'Нормативна грошова оцінка, грн:') {
                        // Знаходимо батьківський div з класом MuiGrid-container
                        const parentContainer = h6.closest('.MuiGrid-container');
                        if (parentContainer) {
                            // Шукаємо наступний div з класом MuiGrid-grid-md-true
                            const valueElement = parentContainer.querySelector('.MuiGrid-grid-md-true h6');
                            if (valueElement && valueElement.textContent.trim() && valueElement !== h6) {
                                const valueText = valueElement.textContent.trim();
                                if (valueText === 'Не вказано') {
                                    results.normativePrice = 'Не вказано';
                                } else {
                                    results.normativePrice = valueText.replace(/[^\d.,]/g, '');
                                }
                                break;
                            }
                        }
                    }
                }
                
                // Якщо нормативна оцінка не знайдена, встановлюємо "Не вказано"
                if (results.normativePrice === 'Не знайдено') {
                    results.normativePrice = 'Не вказано';
                }
                
                // Експертна грошова оцінка, грн - шукаємо за текстом заголовка
                for (const h6 of allH6Elements) {
                    const text = h6.textContent.trim();
                    if (text === 'Експертна грошова оцінка, грн:') {
                        // Знаходимо батьківський div з класом MuiGrid-container
                        const parentContainer = h6.closest('.MuiGrid-container');
                        if (parentContainer) {
                            // Шукаємо наступний div з класом MuiGrid-grid-md-true
                            const valueElement = parentContainer.querySelector('.MuiGrid-grid-md-true h6');
                            if (valueElement && valueElement.textContent.trim() && valueElement !== h6) {
                                results.expertPrice = valueElement.textContent.trim().replace(/[^\d.,]/g, '');
                                break;
                            }
                        }
                    }
                }
                
                // Кадастровий номер - спочатку шукаємо в класифікаторі майна
                let cadastralNumber = 'Не знайдено';
                
                // Кадастровий номер - шукаємо в структурі сітки
                const cadastralLabel = Array.from(allH6Elements).find(h6 => h6.textContent.trim() === 'Кадастровий номер:');
                
                if (cadastralLabel) {
                    // Знаходимо батьківський контейнер сітки
                    const gridContainer = cadastralLabel.closest('.MuiGrid-container');
                    if (gridContainer) {
                        // Шукаємо в тому ж контейнері посилання або h6 з кадастровим номером
                        const cadastralLink = gridContainer.querySelector('a[href*="cadnum"]');
                        if (cadastralLink) {
                            cadastralNumber = cadastralLink.textContent.trim();
                        } else {
                            // Якщо немає посилання, шукаємо h6 в тому ж контейнері
                            const allH6InContainer = gridContainer.querySelectorAll('h6');
                            for (const h6 of allH6InContainer) {
                                if (h6.textContent.trim() !== 'Кадастровий номер:' && /^[0-9:]+$/.test(h6.textContent.trim())) {
                                    cadastralNumber = h6.textContent.trim();
                                    break;
                                }
                            }
                        }
                    }
                }
                
                // Якщо не знайдено в класифікаторі, шукаємо за селектором
                if (cadastralNumber === 'Не знайдено') {
                    const cadastralElement = document.querySelector('.MuiGrid-spacing-xs-1 a.MuiLink-underlineAlways');
                    if (cadastralElement && cadastralElement.textContent.trim()) {
                        const cadastralText = cadastralElement.textContent.trim();
                        // Перевіряємо, чи це дійсно кадастровий номер (містить цифри та двокрапки)
                        if (/^\d+:\d+:\d+:\d+$/.test(cadastralText)) {
                            cadastralNumber = cadastralText;
                        }
                    }
                }
                
                results.cadastralNumber = cadastralNumber;
                
                // Область - витягуємо з опису лоту
                const lotDescText = results.lotDescription;
                if (lotDescText && lotDescText !== 'Не знайдено') {
                    const regionMatch = lotDescText.match(/([А-Яа-яіїєґІЇЄҐ\s]+)\s*область/i);
                    if (regionMatch) {
                        results.region = regionMatch[1].trim() + ' область';
                    }
                }
                
                // Населений пункт - витягуємо з опису лоту
                if (lotDescText && lotDescText !== 'Не знайдено') {
                    const settlementMatch = lotDescText.match(/область[,\s]+([^,]+)/i);
                    if (settlementMatch) {
                        results.settlement = settlementMatch[1].trim();
                    }
                }
                
                // Організація - шукаємо в accordion "Дані про учасників з переважним правом"
                const accordions = document.querySelectorAll('.MuiAccordion-root');
                for (const accordion of accordions) {
                    const summary = accordion.querySelector('.MuiAccordionSummary-root');
                    if (summary && summary.textContent.includes('Дані про учасників з переважним правом')) {
                        const details = accordion.querySelector('.MuiAccordionDetails-root');
                        if (details) {
                            const orgMatch = details.textContent.match(/Повна юридична назва організації:\s*([^\n]+?)(?:\s*Ідентифікатори організації:|$)/);
                            if (orgMatch) {
                                results.organizationName = orgMatch[1].trim();
                                    break;
                                }
                        }
                    }
                }
                
                // Контактна особа - шукаємо в accordion "Контактна особа"
                for (const accordion of accordions) {
                    const summary = accordion.querySelector('.MuiAccordionSummary-root');
                    if (summary && summary.textContent.includes('Контактна особа')) {
                        const details = accordion.querySelector('.MuiAccordionDetails-root');
                        if (details) {
                            const pibMatch = details.textContent.match(/ПІБ:\s*([^\n]+?)(?:\s*E-mail:|$)/);
                            if (pibMatch) {
                                results.contactPerson = pibMatch[1].trim();
                            }
                            
                            const phoneMatch = details.textContent.match(/Номер телефону:\s*([^\n]+?)(?:\s*Веб адреса:|$)/);
                            if (phoneMatch) {
                                results.phoneNumber = phoneMatch[1].trim();
                            }
                            break;
                        }
                    }
                }
                
                // Дата аукціону - шукаємо h5 з датою
                const allH5 = document.querySelectorAll('h5');
                for (const h5 of allH5) {
                    const text = h5.textContent.trim();
                    if (text && /^\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}$/.test(text)) {
                        results.auctionDate = text;
                                    break;
                                }
                            }
                
                // Класифікатор майна - шукаємо в accordion "Склад лота"
                for (const accordion of accordions) {
                    const summary = accordion.querySelector('.MuiAccordionSummary-root');
                    if (summary && summary.textContent.includes('Склад лота')) {
                        const details = accordion.querySelector('.MuiAccordionDetails-root');
                        if (details) {
                            const classifierMatch = details.textContent.match(/Класифікатор майна\/активів:([^\n]+)/);
                            if (classifierMatch) {
                                results.propertyClassifier = classifierMatch[1].trim();
                            break;
                            }
                        }
                    }
                }
                
                // Лот виставляється - спочатку шукаємо в h4 елементах
                let lotExhibitedBy = 'Не знайдено';
                
                // Шукаємо в h4 елементах
                const h4Elements = document.querySelectorAll('h4');
                for (const h4 of h4Elements) {
                    const text = h4.textContent.trim();
                    const lotMatch = text.match(/(\d+)\s*торги/i);
                    if (lotMatch) {
                        lotExhibitedBy = lotMatch[1];
                                    break;
                                }
                            }
                
                // Якщо не знайдено в h4, шукаємо в описі лоту
                if (lotExhibitedBy === 'Не знайдено' && lotDescText && lotDescText !== 'Не знайдено') {
                    const lotMatch = lotDescText.match(/(\d+)\s*торг/i);
                    if (lotMatch) {
                        lotExhibitedBy = lotMatch[1];
                    }
                }
                
                results.lotExhibitedBy = lotExhibitedBy;
                
                // Період подачі пропозицій - шукаємо в h6 елементах
                for (const h6 of allH6Elements) {
                    const text = h6.textContent.trim();
                    // Шукаємо період з датами
                    if (text.includes('з ') && text.includes(' по ') && text.includes('.')) {
                        results.proposalPeriod = text;
                            break;
                    }
                }
                
                // Координати - шукаємо в структурі сітки
                const coordLabel = Array.from(allH6Elements).find(h6 => h6.textContent.trim() === 'Координати об\'єкту:');
                if (coordLabel) {
                    const gridContainer = coordLabel.closest('.MuiGrid-container');
                    if (gridContainer) {
                        // Шукаємо посилання на Google Maps або текст з координатами
                        const coordLink = gridContainer.querySelector('a[href*="google.com/maps"]');
                        if (coordLink) {
                            results.coordinates = coordLink.textContent.trim();
                        } else {
                            // Якщо немає посилання, шукаємо h6 з координатами
                            const allH6InContainer = gridContainer.querySelectorAll('h6');
                            for (const h6 of allH6InContainer) {
                                if (h6.textContent.trim() !== 'Координати об\'єкту:' && /^[0-9.,\s]+$/.test(h6.textContent.trim())) {
                                    results.coordinates = h6.textContent.trim();
                                    break;
                                }
                            }
                        }
                    }
                }
                
                // КОАТУУ - шукаємо в структурі сітки
                const koatuuLabel = Array.from(allH6Elements).find(h6 => h6.textContent.trim() === 'Класифікація по КОАТУУ:');
                if (koatuuLabel) {
                    const gridContainer = koatuuLabel.closest('.MuiGrid-container');
                    if (gridContainer) {
                        // Шукаємо h6 з КОАТУУ
                        const allH6InContainer = gridContainer.querySelectorAll('h6');
                        for (const h6 of allH6InContainer) {
                            if (h6.textContent.trim() !== 'Класифікація по КОАТУУ:' && /^[0-9]+$/.test(h6.textContent.trim())) {
                                results.koatuu = h6.textContent.trim();
                                    break;
                                }
                            }
                    }
                }
                
                // Поштовий індекс - шукаємо в структурі сітки
                const postalLabel = Array.from(allH6Elements).find(h6 => h6.textContent.trim() === 'Поштовий індекс:');
                if (postalLabel) {
                    const gridContainer = postalLabel.closest('.MuiGrid-container');
                    if (gridContainer) {
                        // Шукаємо h6 з поштовим індексом
                        const allH6InContainer = gridContainer.querySelectorAll('h6');
                        for (const h6 of allH6InContainer) {
                            if (h6.textContent.trim() !== 'Поштовий індекс:') {
                                const postalText = h6.textContent.trim();
                                results.postalCode = postalText === 'Не вказано' ? 'Не вказано' : postalText;
                            break;
                        }
                    }
                }
            }
            
                return results;
            } catch (error) {
                console.error('Помилка в page.evaluate:', error);
                return { error: error.message };
            }
        });
        
        if (additionalDetails.error) {
            console.log(`❌ Помилка при зборі даних: ${additionalDetails.error}`);
            return {
                region: 'Не знайдено',
                settlement: 'Не знайдено',
                coordinates: 'Не знайдено',
                koatuu: 'Не знайдено',
                organizationName: 'Не знайдено',
                contactPerson: 'Не знайдено',
                phoneNumber: 'Не знайдено',
                auctionDate: 'Не знайдено',
                proposalPeriod: 'Не знайдено',
                propertyClassifier: 'Не знайдено',
                lotExhibitedBy: 'Не знайдено',
                postalCode: 'Не знайдено'
            };
        }
        
        console.log(`✅ Знайдено додаткові дані на ua.land:`);
        console.log(`  Область: ${additionalDetails.region}`);
        console.log(`  Населений пункт: ${additionalDetails.settlement}`);
        console.log(`  Координати: ${additionalDetails.coordinates}`);
        console.log(`  КОАТУУ: ${additionalDetails.koatuu}`);
        console.log(`  Організація: ${additionalDetails.organizationName}`);
        console.log(`  Контактна особа: ${additionalDetails.contactPerson}`);
        console.log(`  Телефон: ${additionalDetails.phoneNumber}`);
        console.log(`  Дата аукціону: ${additionalDetails.auctionDate}`);
        console.log(`  Період подачі пропозицій: ${additionalDetails.proposalPeriod}`);
        console.log(`  Класифікатор майна: ${additionalDetails.propertyClassifier}`);
        console.log(`  Лот виставляється: ${additionalDetails.lotExhibitedBy}`);
        console.log(`  Поштовий індекс: ${additionalDetails.postalCode}`);
        
        return additionalDetails;
        
    } catch (error) {
        console.error(`❌ Помилка при зборі даних з ua.land:`, error.message);
        return {
            region: 'Не знайдено',
            settlement: 'Не знайдено',
            coordinates: 'Не знайдено',
            koatuu: 'Не знайдено',
            organizationName: 'Не знайдено',
            contactPerson: 'Не знайдено',
            phoneNumber: 'Не знайдено',
            auctionDate: 'Не знайдено',
            proposalPeriod: 'Не знайдено',
            propertyClassifier: 'Не знайдено',
            lotExhibitedBy: 'Не знайдено',
            postalCode: 'Не знайдено'
        };
    }
}

async function getAuctionTitle(page, auctionUrl) {
    try {
        await page.goto(auctionUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Додаткове очікування для повного завантаження
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Отримуємо тільки назву лоту
        const lotTitle = await page.evaluate(() => {
            const titleElement = document.querySelector('.information-title span');
            return titleElement ? titleElement.textContent.trim() : '';
        });
        
        return lotTitle;
    } catch (error) {
        console.log(`⚠️ Помилка при отриманні назви аукціону: ${error.message}`);
        return '';
    }
}

function shouldSkipAuction(lotTitle, stopWords) {
    if (!lotTitle) return true;
    
    const lowerTitle = lotTitle.toLowerCase();
    
    // Перевіряємо кожне стоп-слово
    for (const stopWord of stopWords) {
        if (lowerTitle.includes(stopWord)) {
            console.log(`⏭️ Пропускаю аукціон: "${lotTitle}" (містить стоп-слово: "${stopWord}")`);
            return true;
        }
    }
    
    return false;
}

function shortenPreferentialRight(preferentialRight) {
    if (!preferentialRight || preferentialRight === 'Не знайдено') {
        return 'Не знайдено';
    }
    
    const lowerText = preferentialRight.toLowerCase();
    
    if (lowerText.includes('не скористався ним') || lowerText.includes('не скористався')) {
        return 'Не скористався';
    }
    
    if (lowerText.includes('був відсутній')) {
        return 'Був відсутній';
    }
    
    if (lowerText.includes('зробив максимальну цінову пропозицію') || lowerText.includes('зробив максимальну пропозицію')) {
        return 'Зробив максимальну пропозицію';
    }
    
    // Якщо не знайдено відповідності, повертаємо оригінальне значення
    return preferentialRight;
}

async function getAuctionDetails(page, auctionUrl) {
    console.log(`🔍 Збираю дані з: ${auctionUrl}`);
    
    try {
        await page.goto(auctionUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Додаткове очікування для повного завантаження
        console.log('⏳ Очікую повного завантаження сторінки...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Збираємо детальну інформацію
        const details = await page.evaluate(() => {
            // URL
            const url = window.location.href;
            
            // Опис лоту - .information-title span
            let lotDescription = 'Не знайдено';
            const lotTitle = document.querySelector('.information-title span');
            if (lotTitle) {
                lotDescription = lotTitle.textContent.trim();
            }
            
            // Площа ділянки, га - шукаємо елемент з текстом "Площа ділянки:" і беремо значення
            let area = 'Не знайдено';
            const areaElements = document.querySelectorAll('.characteristics__item');
            for (const element of areaElements) {
                const nameElement = element.querySelector('.characteristics__name');
                if (nameElement && nameElement.textContent.trim() === 'Площа ділянки:') {
                    const valueElement = element.querySelector('.characteristics__value');
                    if (valueElement) {
                        // Замінюємо кому на крапку та видаляємо "га" для правильного формату
                        area = valueElement.textContent.trim().replace(',', '.').replace(/\s*га\s*/g, '');
                        break;
                    }
                }
            }
            
            // Стартова ціна - шукаємо елемент з текстом "Стартова ціна продажу:" і беремо значення
            let startPrice = 'Не знайдено';
            const priceElements = document.querySelectorAll('.auction-info__item');
            for (const element of priceElements) {
                const nameElement = element.querySelector('.auction-info__name');
                if (nameElement && nameElement.textContent.trim().includes('Стартова ціна продажу:')) {
                    const valueElement = element.querySelector('.auction-info__value');
                    if (valueElement) {
                        // Видаляємо всі символи крім цифр, крапки та коми, потім замінюємо кому на крапку
                        startPrice = valueElement.textContent.trim().replace(/[^\d.,]/g, '').replace(',', '.');
                        break;
                    }
                }
            }
            
            // Нормативна грошова оцінка, грн
            let normativePrice = 'Не знайдено';
            const normativeElement = document.querySelector('[data-field="normative-price"], .normative-price');
            if (normativeElement) {
                normativePrice = normativeElement.textContent.trim().replace(/[^\d.,]/g, '');
            }
            
            // Експертна грошова оцінка, грн - шукаємо елемент з текстом "Експертна грошова оцінка:"
            let expertPrice = 'Не знайдено';
            for (const element of priceElements) {
                const nameElement = element.querySelector('.auction-info__name');
                if (nameElement && nameElement.textContent.trim() === 'Експертна грошова оцінка:') {
                    const valueElement = element.querySelector('.auction-info__value');
                    if (valueElement) {
                        // Видаляємо всі символи крім цифр, крапки та коми, потім замінюємо кому на крапку
                        expertPrice = valueElement.textContent.trim().replace(/[^\d.,]/g, '').replace(',', '.');
                        break;
                    }
                }
            }
            
            // Кадастровий номер - шукаємо елемент з текстом "Кадастровий номер"
            let cadastralNumber = 'Не знайдено';
            const cadastralElements = document.querySelectorAll('.sc-rt__option-wrapper');
            for (const element of cadastralElements) {
                const nameElement = element.querySelector('.sc-rt__option-name');
                if (nameElement && nameElement.textContent.trim() === 'Кадастровий номер') {
                    const valueElement = element.querySelector('.sc-rt__option-value');
                    if (valueElement) {
                        cadastralNumber = valueElement.textContent.trim();
                        break;
                    }
                }
            }
            
            // Область - витягуємо з адреси місцезнаходження майна
            let region = 'Не знайдено';
            const addressElements = document.querySelectorAll('.lots__item');
            for (const element of addressElements) {
                const nameElement = element.querySelector('.lots__name');
                if (nameElement && nameElement.textContent.trim().includes('Адреса місцезнаходження майна:')) {
                    const valueElement = element.querySelector('.lots__value--address span');
                    if (valueElement) {
                        const addressText = valueElement.textContent.trim();
                        // Шукаємо область в адресі (формат: "Україна, Черкаська область, ...")
                        const regionMatch = addressText.match(/Україна,\s*([^,]+)\s*область/);
                        if (regionMatch) {
                            region = regionMatch[1].trim() + ' область';
                        }
                        break;
                    }
                }
            }
            
            // Населений пункт - витягуємо з тієї ж адреси
            let settlement = 'Не знайдено';
            for (const element of addressElements) {
                const nameElement = element.querySelector('.lots__name');
                if (nameElement && nameElement.textContent.trim().includes('Адреса місцезнаходження майна:')) {
                    const valueElement = element.querySelector('.lots__value--address span');
                    if (valueElement) {
                        const addressText = valueElement.textContent.trim();
                        // Шукаємо населений пункт в адресі (після області)
                        const parts = addressText.split(',').map(part => part.trim());
                        for (let i = 0; i < parts.length; i++) {
                            if (parts[i].includes('область') && i + 1 < parts.length) {
                                settlement = parts[i + 1];
                                break;
                            }
                        }
                        break;
                    }
                }
            }
            
            // КОАТУУ
            let koatuu = 'Не знайдено';
            const koatuuElement = document.querySelector('[data-field="koatuu"], .koatuu');
            if (koatuuElement) {
                koatuu = koatuuElement.textContent.trim();
            }
            
            // Координати об'єкту
            let coordinates = 'Не знайдено';
            const coordinatesElement = document.querySelector('[data-field="coordinates"], .coordinates');
            if (coordinatesElement) {
                coordinates = coordinatesElement.textContent.trim();
            }
            
            // Статус аукціону - шукаємо в .news-card__status
            let auctionStatus = 'Не знайдено';
            const statusElement = document.querySelector('.news-card__status');
            if (statusElement) {
                auctionStatus = statusElement.textContent.trim();
            }
            
            // Кількість учасників
            let participantsCount = 'Не знайдено';
            const participantsElement = document.querySelector('.participants-count, .bidders, [data-field="participants"]');
            if (participantsElement) {
                participantsCount = participantsElement.textContent.trim();
            }
            
            // Фінальна вартість
            let finalPrice = 'Не знайдено';
            const finalPriceElement = document.querySelector('.final-price, .winning-bid, [data-field="final-price"]');
            if (finalPriceElement) {
                finalPrice = finalPriceElement.textContent.trim().replace(/[^\d.,]/g, '');
            }
            
            // Відсоток на який фінальна вартість більша ніж стартова ціна
            let priceIncreasePercent = 'Не знайдено';
            if (startPrice !== 'Не знайдено' && finalPrice !== 'Не знайдено') {
                const start = parseFloat(startPrice.replace(',', '.'));
                const final = parseFloat(finalPrice.replace(',', '.'));
                if (!isNaN(start) && !isNaN(final) && start > 0) {
                    const increase = ((final - start) / start) * 100;
                    priceIncreasePercent = increase.toFixed(2);
                }
            }
            
            // Переможець (назва)
            let winner = 'Не знайдено';
            const winnerElement = document.querySelector('.winner, .winning-bidder, [data-field="winner"]');
            if (winnerElement) {
                winner = winnerElement.textContent.trim();
            }
            
            // Переважне право - шукаємо в details з класом "inform-details lots__wrap" який містить інформацію про переважне право
            let preferentialRight = 'Не знайдено';
            const allDetails = document.querySelectorAll('.inform-details.lots__wrap');
            
            for (const details of allDetails) {
                const summary = details.querySelector('.inform-details__summary');
                if (summary && summary.textContent.includes('переважним правом')) {
                    // Шукаємо span з назвою організації
                    const orgNameElement = details.querySelector('span.lots__value');
                    if (orgNameElement) {
                        preferentialRight = orgNameElement.textContent.trim();
                        break;
                    }
                }
            }
            
            return {
                url,
                lotDescription,
                area,
                startPrice,
                normativePrice,
                expertPrice,
                cadastralNumber,
                region,
                settlement,
                koatuu,
                coordinates,
                auctionStatus,
                participantsCount,
                finalPrice,
                priceIncreasePercent,
                winner,
                preferentialRight
            };
        });
        
        console.log(`✅ Зібрано дані для: ${auctionUrl}`);
        console.log(`📝 Опис лоту: ${details.lotDescription.substring(0, 100)}...`);
        console.log(`📊 Зібрані дані:`);
        console.log(`  Площа: ${details.area}`);
        console.log(`  Стартова ціна: ${details.startPrice}`);
        console.log(`  Нормативна оцінка: ${details.normativePrice}`);
        console.log(`  Експертна оцінка: ${details.expertPrice}`);
        console.log(`  Кадастровий номер: ${details.cadastralNumber}`);
        console.log(`  Область: ${details.region}`);
        console.log(`  Населений пункт: ${details.settlement}`);
        console.log(`  КОАТУУ: ${details.koatuu}`);
        console.log(`  Координати: ${details.coordinates}`);
        console.log(`  Статус: ${details.auctionStatus}`);
        console.log(`  Учасники: ${details.participantsCount}`);
        console.log(`  Фінальна ціна: ${details.finalPrice}`);
        console.log(`  Зростання ціни: ${details.priceIncreasePercent}%`);
        console.log(`  Переможець: ${details.winner}`);
        console.log(`  Переважне право: ${details.preferentialRight}`);
        
        // Збираємо результати аукціону з auction.prozorro.sale
        console.log(`🔍 Збираю результати аукціону...`);
        const auctionResults = await getAuctionResults(page, auctionUrl, details.startPrice);
        
        // Оновлюємо дані результатами аукціону
        if (auctionResults.participantsCount !== 'Не знайдено') {
            details.participantsCount = auctionResults.participantsCount;
            console.log(`✅ Оновлено кількість учасників: ${details.participantsCount}`);
        }
        if (auctionResults.finalPrice !== 'Не знайдено') {
            details.finalPrice = auctionResults.finalPrice;
            console.log(`✅ Оновлено фінальну вартість: ${details.finalPrice}`);
        }
        if (auctionResults.winner !== 'Не знайдено') {
            details.winner = auctionResults.winner;
            console.log(`✅ Оновлено переможця: ${details.winner}`);
        }
        // Відсоток зростання ціни буде розрахований формулою в Google Таблиці
        if (auctionResults.preferentialRight !== 'Не знайдено') {
            details.preferentialRight = auctionResults.preferentialRight;
            console.log(`✅ Оновлено переважне право: ${details.preferentialRight}`);
        }
        
        // Перевіряємо, чи потрібно шукати додаткові дані на ua.land
        // Шукаємо додаткові дані, якщо не вистачає критично важливих полів
        const needsAdditionalData = 
            details.region === 'Не знайдено' || 
            details.settlement === 'Не знайдено' || 
            details.coordinates === 'Не знайдено' || 
            details.koatuu === 'Не знайдено' ||
            details.normativePrice === 'Не знайдено' ||
            details.expertPrice === 'Не знайдено' ||
            details.cadastralNumber === 'Не знайдено';
            
        if (needsAdditionalData) {
            console.log(`🔍 Деякі дані не знайдено на prozorro.sale, шукаю на ua.land...`);
            const additionalDetails = await getAuctionDetailsFromUaLand(page, auctionUrl);
            
            // Оновлюємо дані, якщо знайшли щось нове
            if (additionalDetails.region !== 'Не знайдено') {
                details.region = additionalDetails.region;
                console.log(`✅ Оновлено область: ${details.region}`);
            }
            if (additionalDetails.settlement !== 'Не знайдено') {
                details.settlement = additionalDetails.settlement;
                console.log(`✅ Оновлено населений пункт: ${details.settlement}`);
            }
            if (additionalDetails.coordinates !== 'Не знайдено') {
                details.coordinates = additionalDetails.coordinates;
                console.log(`✅ Оновлено координати: ${details.coordinates}`);
            }
            if (additionalDetails.koatuu !== 'Не знайдено') {
                details.koatuu = additionalDetails.koatuu;
                console.log(`✅ Оновлено КОАТУУ: ${details.koatuu}`);
            }
            if (additionalDetails.normativePrice !== 'Не знайдено') {
                details.normativePrice = additionalDetails.normativePrice;
                console.log(`✅ Оновлено нормативну оцінку: ${details.normativePrice}`);
            }
            if (additionalDetails.expertPrice !== 'Не знайдено') {
                details.expertPrice = additionalDetails.expertPrice;
                console.log(`✅ Оновлено експертну оцінку: ${details.expertPrice}`);
            }
            if (additionalDetails.cadastralNumber !== 'Не знайдено') {
                details.cadastralNumber = additionalDetails.cadastralNumber;
                console.log(`✅ Оновлено кадастровий номер: ${details.cadastralNumber}`);
            }
            
            // Додаємо нові поля, які можуть бути корисними
            if (additionalDetails.organizationName !== 'Не знайдено') {
                details.organizationName = additionalDetails.organizationName;
                console.log(`✅ Додано організацію: ${details.organizationName}`);
            }
            if (additionalDetails.contactPerson !== 'Не знайдено') {
                details.contactPerson = additionalDetails.contactPerson;
                console.log(`✅ Додано контактну особу: ${details.contactPerson}`);
            }
            if (additionalDetails.phoneNumber !== 'Не знайдено') {
                details.phoneNumber = additionalDetails.phoneNumber;
                console.log(`✅ Додано телефон: ${details.phoneNumber}`);
            }
            if (additionalDetails.auctionDate !== 'Не знайдено') {
                details.auctionDate = additionalDetails.auctionDate;
                console.log(`✅ Додано дату аукціону: ${details.auctionDate}`);
            }
            if (additionalDetails.proposalPeriod !== 'Не знайдено') {
                details.proposalPeriod = additionalDetails.proposalPeriod;
                console.log(`✅ Додано період подачі пропозицій: ${details.proposalPeriod}`);
            }
            if (additionalDetails.propertyClassifier !== 'Не знайдено') {
                details.propertyClassifier = additionalDetails.propertyClassifier;
                console.log(`✅ Додано класифікатор майна: ${details.propertyClassifier}`);
            }
            if (additionalDetails.lotExhibitedBy !== 'Не знайдено') {
                details.lotExhibitedBy = additionalDetails.lotExhibitedBy;
                console.log(`✅ Додано номер лоту: ${details.lotExhibitedBy}`);
            }
            if (additionalDetails.postalCode !== 'Не знайдено') {
                details.postalCode = additionalDetails.postalCode;
                console.log(`✅ Додано поштовий індекс: ${details.postalCode}`);
            }
        }
        
        // Скорочуємо значення переважного права
        details.preferentialRight = shortenPreferentialRight(details.preferentialRight);
        
        return details;
        
    } catch (error) {
        console.error(`❌ Помилка при зборі даних з ${auctionUrl}:`, error.message);
        return {
            url: auctionUrl,
            lotDescription: 'Помилка',
            area: 'Помилка',
            startPrice: 'Помилка',
            normativePrice: 'Помилка',
            expertPrice: 'Помилка',
            cadastralNumber: 'Помилка',
            region: 'Помилка',
            settlement: 'Помилка',
            koatuu: 'Помилка',
            coordinates: 'Помилка',
            auctionStatus: 'Помилка',
            participantsCount: 'Помилка',
            finalPrice: 'Помилка',
            priceIncreasePercent: 'Помилка',
            winner: 'Помилка',
            preferentialRight: 'Помилка'
        };
    }
}

// Кеш для зберігання URL, які вже перевірені
let urlCache = new Set();

async function isUrlAlreadyInSheet(url, spreadsheetId) {
    try {
        // Спочатку перевіряємо кеш
        if (urlCache.has(url)) {
            return true;
        }
        
        const sheets = getGoogleSheets();
        
        // Отримуємо всі URL з колонки A
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Аналітика!A:A',
        });
        
        if (response.data.values) {
            // Перевіряємо, чи є наш URL в таблиці
            const isDuplicate = response.data.values.some(row => row[0] === url);
            
            // Додаємо в кеш, якщо знайшли дублікат
            if (isDuplicate) {
                urlCache.add(url);
            }
            
            return isDuplicate;
        }
        
        return false;
    } catch (error) {
        console.log(`⚠️ Помилка при перевірці дублікатів: ${error.message}`);
        return false; // У разі помилки додаємо рядок
    }
}

// Функція для очищення кешу (можна викликати при початку нового запуску)
function clearUrlCache() {
    urlCache.clear();
    console.log('🧹 Кеш URL очищено');
}

async function addRowToAnalyticsSheet(rowData, spreadsheetId) {
    try {
        const sheets = getGoogleSheets();
        
        // Знаходимо останній вільний рядок
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Аналітика!A:A',
        });
        
        let nextRow = 1;
        if (response.data.values) {
            nextRow = response.data.values.length + 1;
        }
        
        // Якщо це перший рядок, додаємо заголовки
        if (nextRow === 1) {
            const headers = [
                'URL', 'Опис лоту', 'Площа ділянки, га', 'Стартова ціна', 
                'Ціна за га в $', 'Нормативна грошова оцінка, грн', 'Експертна грошова оцінка, грн',
                'Кадастровий номер', 'Область', 'Населений пункт', 'КОАТУУ', 'Координати об\'єкту',
                'Статус аукціону', 'Кількість учасників', 'Фінальна вартість', 
                'Відсоток зростання ціни', 'Переможець', 'ID переможця', 'Переважне право',
                'Організація', 'Контактна особа', 'Телефон', 'Дата аукціону',
                'Період подачі пропозицій', 'Класифікатор майна', 'Номер лоту', 'Поштовий індекс'
            ];
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: 'Аналітика!A1',
                valueInputOption: 'RAW',
                resource: { values: [headers] },
            });
            nextRow = 2; // Наступний рядок після заголовків
        }
        
        // Додаємо рядок даних
        const currentRow = nextRow; // Номер поточного рядка
        const row = [
            rowData.url,
            rowData.lotDescription,
            rowData.area,
            rowData.startPrice,
            `=IF(AND(ISNUMBER(D${currentRow}),ISNUMBER(C${currentRow})),D${currentRow}/C${currentRow}/'змінні'!B2,"")`, // Ціна за га в $ - формула
            rowData.normativePrice,
            rowData.expertPrice,
            rowData.cadastralNumber,
            rowData.region,
            rowData.settlement,
            rowData.koatuu,
            rowData.coordinates,
            rowData.auctionStatus,
            rowData.participantsCount,
            rowData.finalPrice,
            `=IF(AND(ISNUMBER(O${currentRow}),ISNUMBER(D${currentRow})),((O${currentRow}-D${currentRow})/D${currentRow})*100,"")`, // Відсоток зростання ціни - формула
            rowData.winner,
            rowData.winnerId || 'Не знайдено',
            rowData.preferentialRight,
            rowData.organizationName || 'Не знайдено',
            rowData.contactPerson || 'Не знайдено',
            rowData.phoneNumber || 'Не знайдено',
            rowData.auctionDate || 'Не знайдено',
            rowData.proposalPeriod || 'Не знайдено',
            rowData.propertyClassifier || 'Не знайдено',
            rowData.lotExhibitedBy || 'Не знайдено',
            rowData.postalCode || 'Не знайдено'
        ];
        
        try {
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `Аналітика!A${currentRow}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [row] },
            });
            
            console.log(`✅ Додано рядок ${currentRow}: ${rowData.url}`);
            
            // Додаємо URL до кешу, щоб уникнути повторної обробки
            urlCache.add(rowData.url);
            
            return true; // Повертаємо true при успішному додаванні
            
        } catch (rangeError) {
            // Якщо помилка з діапазоном, спробуємо розширити таблицю
            if (rangeError.message.includes('exceeds grid limits')) {
                console.log(`📏 Розширюю таблицю для рядка ${currentRow}...`);
                
                // Отримуємо метадані таблиці
                const metadata = await sheets.spreadsheets.get({
                    spreadsheetId,
                    ranges: ['Аналітика!A:AC'],
                    fields: 'sheets.properties'
                });
                
                const sheetId = metadata.data.sheets[0].properties.sheetId;
                const currentRows = metadata.data.sheets[0].properties.gridProperties.rowCount;
                
                // Розширюємо таблицю на 100 рядків
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    resource: {
                        requests: [{
                            updateSheetProperties: {
                                properties: {
                                    sheetId: sheetId,
                                    gridProperties: {
                                        rowCount: currentRows + 100
                                    }
                                },
                                fields: 'gridProperties.rowCount'
                            }
                        }]
                    }
                });
                
                // Тепер додаємо рядок
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `Аналітика!A${currentRow}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [row] },
                });
                
                console.log(`✅ Додано рядок ${currentRow}: ${rowData.url} (таблицю розширено)`);
                
                // Додаємо URL до кешу, щоб уникнути повторної обробки
                urlCache.add(rowData.url);
                
                return true; // Повертаємо true при успішному додаванні
            } else {
                throw rangeError;
            }
        }
        
    } catch (error) {
        console.error(`❌ Помилка при додаванні рядка:`, error.message);
        throw error;
    }
}

async function main() {
    const browser = await puppeteer.launch({
        headless: true, // Приховуємо браузер
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: { width: 1400, height: 900 },
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        // Перевіряємо наявність Google Sheets ID
        const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
        if (!spreadsheetId) {
            console.error('❌ Не вказано GOOGLE_SPREADSHEET_ID в .env файлі');
            return;
        }
        
        // Отримуємо BASE_URL з Google таблиці
        BASE_URL = await getBaseUrlFromGoogleSheet();
        if (!BASE_URL) {
            console.error('❌ Не вдалося отримати PROZORRO_BASE_URL з Google таблиці або .env файлу');
            return;
        }
        
        // Отримуємо стоп-слова з Google таблиці
        const stopWords = await getStopWordsFromGoogleSheet();
        
        // Очищаємо кеш URL на початку
        clearUrlCache();
        
        // Очищаємо таблицю перед початком
        let startRow = 1;
        try {
            const sheets = getGoogleSheets();
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: 'Аналітика!A:A',
            });
            
            if (response.data.values) {
                startRow = response.data.values.length + 1;
            }
            console.log(`📊 Починаю з рядка ${startRow}`);
        } catch (error) {
            console.log('📊 Починаю з першого рядка (новий файл)');
        }

        // Переходимо на сторінку пошуку та збираємо всі посилання
        console.log('\n🔍 Переходжу на сторінку пошуку...');
        console.log(`📍 URL: ${BASE_URL}`);
        
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Очікуємо завантаження сторінки
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Поступовий збір даних з кожної сторінки
        let currentPage = 1;
        let totalProcessed = 0;
        let totalSuccess = 0;
        let totalDuplicates = 0;
        let totalFiltered = 0;
        let hasMorePages = true;
        let consecutiveEmptyPages = 0; // Лічильник послідовних порожніх сторінок

        while (hasMorePages) {
            console.log(`\n📄 === ОБРОБКА СТОРІНКИ ${currentPage} ===`);
            
            // Формуємо URL для поточної сторінки
            const currentPageUrl = buildPageUrl(BASE_URL, currentPage);
            console.log(`📍 URL сторінки: ${currentPageUrl}`);
            
            // Переходимо на поточну сторінку
            try {
                await page.goto(currentPageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (error) {
                console.log(`⚠️ Помилка при переході на сторінку ${currentPage}: ${error.message}`);
                consecutiveEmptyPages++;
                if (consecutiveEmptyPages >= 3) {
                    console.log(`⚠️ 3 послідовні помилки, зупиняю збір`);
                    break;
                }
                currentPage++;
                continue;
            }
            
            // Збираємо посилання з поточної сторінки
            const pageLinks = await getAuctionLinks(page);
            
            if (pageLinks.length === 0) {
                console.log(`⚠️ На сторінці ${currentPage} не знайдено жодного аукціону`);
                consecutiveEmptyPages++;
                if (consecutiveEmptyPages >= 3) {
                    console.log(`⚠️ 3 послідовні порожні сторінки, зупиняю збір`);
                    hasMorePages = false;
                    break;
                }
                currentPage++;
                continue;
            }

            // Скидаємо лічильник порожніх сторінок, якщо знайшли аукціони
            consecutiveEmptyPages = 0;

            console.log(`📊 Знайдено ${pageLinks.length} аукціонів на сторінці ${currentPage}`);

            // Обробляємо кожен аукціон з поточної сторінки
            let pageProcessed = 0;
            let pageSuccess = 0;
            let pageDuplicates = 0;
            let pageFiltered = 0;

            for (let i = 0; i < pageLinks.length; i++) {
                const auctionUrl = pageLinks[i];
                pageProcessed++;
                totalProcessed++;

                try {
                    console.log(`\n🔄 [Сторінка ${currentPage}] Перевіряю аукціон ${pageProcessed}/${pageLinks.length}: ${auctionUrl}`);

                    // 1. Спочатку перевіряємо, чи вже є такий URL в таблиці
                    const isDuplicate = await isUrlAlreadyInSheet(auctionUrl, spreadsheetId);
                    if (isDuplicate) {
                        console.log(`⏭️ [Сторінка ${currentPage}] Аукціон ${pageProcessed} пропущено (дублікат): ${auctionUrl}`);
                        pageDuplicates++;
                        totalDuplicates++;
                        continue;
                    }

                    // 2. Отримуємо назву аукціону для перевірки фільтрів
                    const lotTitle = await getAuctionTitle(page, auctionUrl);
                    
                    // 3. Перевіряємо фільтри
                    if (shouldSkipAuction(lotTitle, stopWords)) {
                        console.log(`⏭️ [Сторінка ${currentPage}] Аукціон ${pageProcessed} пропущено через фільтрацію`);
                        pageFiltered++;
                        totalFiltered++;
                        continue;
                    }

                    // 4. Якщо пройшли всі перевірки - збираємо дані
                    console.log(`✅ [Сторінка ${currentPage}] Аукціон ${pageProcessed} пройшов перевірки, збираю дані...`);
                    const details = await getAuctionDetails(page, auctionUrl);

                    // 5. Додаємо рядок до Google таблиці
                    const wasAdded = await addRowToAnalyticsSheet(details, spreadsheetId);

                    if (wasAdded) {
                        pageSuccess++;
                        totalSuccess++;
                        console.log(`✅ [Сторінка ${currentPage}] Аукціон ${pageProcessed} успішно оброблено`);
                    } else {
                        console.log(`⏭️ [Сторінка ${currentPage}] Аукціон ${pageProcessed} не додано до таблиці`);
                    }

                    // Пауза між обробкою аукціонів
                    await new Promise(resolve => setTimeout(resolve, 2000));

                } catch (error) {
                    console.error(`❌ [Сторінка ${currentPage}] Помилка при обробці аукціону ${pageProcessed}:`, error.message);
                    // Продовжуємо обробку наступного аукціону
                    continue;
                }
            }

            console.log(`\n📊 Підсумок сторінки ${currentPage}:`);
            console.log(`   📄 Аукціонів на сторінці: ${pageLinks.length}`);
            console.log(`   ✅ Успішно оброблено: ${pageSuccess}`);
            console.log(`   🔄 Дублікатів: ${pageDuplicates}`);
            console.log(`   🚫 Відфільтровано: ${pageFiltered}`);
            console.log(`   ❌ Помилок: ${pageProcessed - pageSuccess - pageDuplicates - pageFiltered}`);

            // Переходимо на наступну сторінку
            currentPage++;

            // Захист від нескінченного циклу
            if (currentPage > 100) {
                console.log(`⚠️ Досягнуто ліміт сторінок (100), зупиняю збір`);
                hasMorePages = false;
                break;
            }
        }

        console.log(`\n🎉 === ЗАГАЛЬНИЙ ПІДСУМОК ===`);
        console.log(`   📄 Оброблено сторінок: ${currentPage}`);
        console.log(`   📊 Всього аукціонів: ${totalProcessed}`);
        console.log(`   ✅ Успішно оброблено: ${totalSuccess}`);
        console.log(`   🔄 Дублікатів: ${totalDuplicates}`);
        console.log(`   🚫 Відфільтровано: ${totalFiltered}`);
        console.log(`   ❌ Помилок: ${totalProcessed - totalSuccess - totalDuplicates - totalFiltered}`);
        console.log(`   🧹 Розмір кешу URL: ${urlCache.size}`);

    } finally {
        await browser.close();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
