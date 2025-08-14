import 'dotenv/config';
import puppeteer from 'puppeteer';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

let BASE = process.env.BASE_URL; // буде оновлено з Google таблиці

function absolutize(url) {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    const base = new URL(BASE);
    return new URL(url, `${base.protocol}//${base.host}`).toString();
}

function buildPageUrl(baseUrl, pageNumber) {
    const url = new URL(baseUrl);
    if (pageNumber === 1) {
        url.searchParams.delete('page');
    } else {
        url.searchParams.set('page', pageNumber.toString());
    }
    return url.toString();
}

async function getAuctionLinks(page) {
    console.log('🔍 Шукаю елементи на сторінці...');
    
    // Спочатку перевіримо, чи є .MuiPaper-root елементи
    const paperElements = await page.$$('.MuiPaper-root');
    console.log(`📄 Знайдено .MuiPaper-root елементів: ${paperElements.length}`);
    
    // Перевіримо ваш XPath селектор
    const xpathSelector = './/a[starts-with(@href,\'/auctions/\')][descendant::h4[contains(@class,\'MuiTypography-h4\')]]';
    const xpathLinks = await page.evaluate((xpath) => {
        const result = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null
        );
        return result.snapshotLength;
    }, xpathSelector);
    console.log(`🔗 Знайдено посилань за XPath: ${xpathLinks}`);
    
    // Спробуємо різні варіанти селекторів
    const allLinks = await page.$$eval('a[href^="/auctions/"]', (links) => {
        return links.map(link => ({
            href: link.getAttribute('href'),
            text: link.textContent?.trim(),
            hasTarget: link.hasAttribute('target'),
            target: link.getAttribute('target'),
            hasH4: !!link.querySelector('h4'),
            h4Text: link.querySelector('h4')?.textContent?.trim()
        }));
    });
    
    console.log(`🔗 Всього посилань з /auctions/: ${allLinks.length}`);
    console.log('📋 Деталі знайдених посилань:');
    allLinks.forEach((link, index) => {
        console.log(`  ${index + 1}. ${link.href} | "${link.text}" | target="${link.target}" | hasH4=${link.hasH4} | h4Text="${link.h4Text}"`);
    });
    
    // Використовуємо ваш XPath селектор
    const links = await page.evaluate((xpath) => {
        const result = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null
        );
        
        const out = [];
        for (let i = 0; i < result.snapshotLength; i++) {
            const node = result.snapshotItem(i);
            if (node && node.getAttribute('href')) {
                out.push(node.getAttribute('href'));
            }
        }
        return out;
    }, xpathSelector);

    console.log(`✅ Фінальний результат XPath: ${links.length} посилань`);
    return [...new Set(links)];
}

async function getAuctionDetails(page, auctionUrl) {
    console.log(`🔍 Збираю дані з: ${auctionUrl}`);
    
    try {
        await page.goto(auctionUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Додаткове очікування для повного завантаження
        console.log('⏳ Очікую повного завантаження сторінки...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Розкриваємо всі accordion елементи
        console.log('📋 Розкриваю всі accordion елементи...');
        try {
            const accordionSelector = '.MuiAccordion-root .MuiAccordionSummary-root';
            await page.waitForSelector(accordionSelector, { timeout: 5000 });
            
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
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log('✅ Всі accordion елементи розкрито');
        } catch (e) {
            console.log('⚠️ Помилка при розкритті accordion елементів');
        }
        
        // Очікуємо завантаження динамічного контенту
        try {
            await page.waitForSelector('h3.MuiTypography-colorPrimary, [data-testid="price"], .price, .start-price, .initial-price', { timeout: 5000 });
        } catch (e) {
            console.log('⚠️ Ціна не знайдена, продовжую...');
        }
        
        // Додаткове очікування для JavaScript
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Очікуємо завантаження основних елементів
        try {
            await page.waitForSelector('h4', { timeout: 5000 });
        } catch (e) {
            // Продовжуємо без помилки
        }
        
        try {
            await page.waitForSelector('h3', { timeout: 5000 });
        } catch (e) {
            // Продовжуємо без помилки
        }
        
        
        

        

        
        // Діагностика accordion елементів
        console.log('🔍 Діагностика accordion елементів:');
        const accordionInfo = await page.evaluate(() => {
            const accordionElements = document.querySelectorAll('.MuiAccordion-root');
            const accordionData = [];
            
            accordionElements.forEach((accordion, index) => {
                const summary = accordion.querySelector('.MuiAccordionSummary-root');
                const details = accordion.querySelector('.MuiAccordionDetails-root');
                const isExpanded = accordion.classList.contains('Mui-expanded');
                const summaryText = summary ? summary.textContent.trim() : 'Немає тексту';
                const detailsText = details ? details.textContent.trim() : '';
                
                accordionData.push({
                    index: index + 1,
                    isExpanded,
                    hasSummary: !!summary,
                    hasDetails: !!details,
                    summaryText,
                    detailsText: detailsText.substring(0, 100)
                });
            });
            
            return {
                count: accordionElements.length,
                accordions: accordionData
            };
        });
        
        console.log(`  Знайдено accordion елементів: ${accordionInfo.count}`);
        accordionInfo.accordions.forEach(acc => {
            console.log(`  Accordion ${acc.index}: expanded=${acc.isExpanded}, hasSummary=${acc.hasSummary}, hasDetails=${acc.hasDetails}`);
            console.log(`    Заголовок: ${acc.summaryText}`);
            if (acc.detailsText) {
                console.log(`    Деталі: ${acc.detailsText}...`);
            }
        });
        
        // Збираємо детальну інформацію
        const details = await page.evaluate(() => {
            // URL
            const url = window.location.href;
            
            // Тепер всі accordion розкриті, збираємо дані за вашими селекторами
            let lotDescription = 'Не знайдено';
            let area = 'Не знайдено';
            let startPrice = 'Не знайдено';
            let normativePrice = 'Не знайдено';
            let expertPrice = 'Не знайдено';
            let rentalRate = '';
            let cadastralNumber = 'Не знайдено';
            let region = 'Не знайдено';
            let settlement = 'Не знайдено';
            let organizationName = 'Не знайдено';
            let rentalDates = 'Не знайдено';
            let contactPerson = 'Не знайдено';
            let phoneNumber = 'Не знайдено';
            let auctionDate = 'Не знайдено';
            let proposalPeriod = 'Не знайдено';
            
            // Опис лоту
            const lotDescElement = document.querySelector('.MuiGrid-spacing-xs-3 div:nth-of-type(3) div.MuiAccordionDetails-root');
            if (lotDescElement && lotDescElement.textContent.trim()) {
                lotDescription = lotDescElement.textContent.trim();
            }
            
            // Площа земельної ділянки, га
            // Спробуємо різні структурні селектори
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
                area = areaElement.textContent.trim();
            }
            
            // Діагностика селектора площі
            const areaSelectorDebug = areaElement;
            const areaSelectorText = areaSelectorDebug ? areaSelectorDebug.textContent.trim() : 'НЕ ЗНАЙДЕНО';
            const areaSelectorClasses = areaSelectorDebug ? areaSelectorDebug.className : 'НЕ ЗНАЙДЕНО';
            const areaSelectorParent = areaSelectorDebug && areaSelectorDebug.parentElement ? areaSelectorDebug.parentElement.className : 'НЕ ЗНАЙДЕНО';
            
            // Стартова ціна
            const startPriceElement = document.querySelector('h3.MuiTypography-colorPrimary');
            if (startPriceElement && startPriceElement.textContent.trim()) {
                const priceText = startPriceElement.textContent.trim();
                // Видаляємо всі символи крім цифр, крапки та коми
                startPrice = priceText.replace(/[^\d.,]/g, '');
            }
            
            // Нормативна грошова оцінка, грн - шукаємо за текстом заголовка
            const allH6Elements = document.querySelectorAll('h6');
            for (const h6 of allH6Elements) {
                const text = h6.textContent.trim();
                if (text === 'Нормативна грошова оцінка, грн:') {
                    // Знаходимо батьківський div з класом MuiGrid-container
                    const parentContainer = h6.closest('.MuiGrid-container');
                    if (parentContainer) {
                        // Шукаємо наступний div з класом MuiGrid-grid-md-true
                        const valueElement = parentContainer.querySelector('.MuiGrid-grid-md-true h6');
                        if (valueElement && valueElement.textContent.trim() && valueElement !== h6) {
                            normativePrice = valueElement.textContent.trim().replace(/[^\d.,]/g, '');
                            break;
                        }
                    }
                }
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
                            expertPrice = valueElement.textContent.trim().replace(/[^\d.,]/g, '');
                            break;
                        }
                    }
                }
            }
            
            // Орендна ставка (сума за рік) - шукаємо за текстом заголовка
            for (const h6 of allH6Elements) {
                const text = h6.textContent.trim();
                if (text === 'Орендна ставка (сума за рік):') {
                    // Знаходимо батьківський div з класом MuiGrid-container
                    const parentContainer = h6.closest('.MuiGrid-container');
                    if (parentContainer) {
                        // Шукаємо наступний div з класом MuiGrid-grid-md-true
                        const valueElement = parentContainer.querySelector('.MuiGrid-grid-md-true h6');
                        if (valueElement && valueElement.textContent.trim() && valueElement !== h6) {
                            rentalRate = valueElement.textContent.trim().replace(/[^\d.,]/g, '');
                            break;
                        }
                    }
                }
            }
            
            // Кадастровий номер
            const cadastralElement = document.querySelector('.MuiGrid-spacing-xs-1 a.MuiLink-underlineAlways');
            if (cadastralElement && cadastralElement.textContent.trim()) {
                cadastralNumber = cadastralElement.textContent.trim();
            }
            
            // Область - шукаємо за текстом заголовка
            for (const h6 of allH6Elements) {
                const text = h6.textContent.trim();
                if (text === 'Область:') {
                    // Знаходимо батьківський div з класом MuiGrid-container
                    const parentContainer = h6.closest('.MuiGrid-container');
                    if (parentContainer) {
                        // Шукаємо наступний div з класом MuiGrid-grid-md-true
                        const valueElement = parentContainer.querySelector('.MuiGrid-grid-md-true h6');
                        if (valueElement && valueElement.textContent.trim() && valueElement !== h6) {
                            region = valueElement.textContent.trim();
                            break;
                        }
                    }
                }
            }
            
            // Населений пункт - шукаємо за текстом заголовка
            for (const h6 of allH6Elements) {
                const text = h6.textContent.trim();
                if (text === 'Населений пункт:') {
                    // Знаходимо батьківський div з класом MuiGrid-container
                    const parentContainer = h6.closest('.MuiGrid-container');
                    if (parentContainer) {
                        // Шукаємо наступний div з класом MuiGrid-grid-md-true
                        const valueElement = parentContainer.querySelector('.MuiGrid-grid-md-true h6');
                        if (valueElement && valueElement.textContent.trim() && valueElement !== h6) {
                            settlement = valueElement.textContent.trim();
                            break;
                        }
                    }
                }
            }
            
            // Повна юридична назва організації - шукаємо за текстом заголовка
            for (const h6 of allH6Elements) {
                const text = h6.textContent.trim();
                if (text === 'Повна юридична назва організації:') {
                    // Знаходимо батьківський div з класом MuiGrid-container
                    const parentContainer = h6.closest('.MuiGrid-container');
                    if (parentContainer) {
                        // Шукаємо наступний div з класом MuiGrid-grid-md-true
                        const valueElement = parentContainer.querySelector('.MuiGrid-grid-md-true h6');
                        if (valueElement && valueElement.textContent.trim() && valueElement !== h6) {
                            organizationName = valueElement.textContent.trim();
                            break;
                        }
                    }
                }
            }
            
            // Дата початку та закінчення договору оренди - шукаємо за текстом заголовка
            for (const h6 of allH6Elements) {
                const text = h6.textContent.trim();
                if (text === 'Дата початку та закінчення договору оренди:') {
                    // Знаходимо батьківський div з класом MuiGrid-container
                    const parentContainer = h6.closest('.MuiGrid-container');
                    if (parentContainer) {
                        // Шукаємо наступний div з класом MuiGrid-grid-md-true
                        const valueElement = parentContainer.querySelector('.MuiGrid-grid-md-true h6');
                        if (valueElement && valueElement.textContent.trim() && valueElement !== h6) {
                            rentalDates = valueElement.textContent.trim();
                            break;
                        }
                    }
                }
            }
            
            // ПІБ - шукаємо за текстом заголовка
            for (const h6 of allH6Elements) {
                const text = h6.textContent.trim();
                if (text === 'ПІБ:') {
                    // Знаходимо батьківський div з класом MuiGrid-container
                    const parentContainer = h6.closest('.MuiGrid-container');
                    if (parentContainer) {
                        // Шукаємо наступний div з класом MuiGrid-grid-md-true
                        const valueElement = parentContainer.querySelector('.MuiGrid-grid-md-true h6');
                        if (valueElement && valueElement.textContent.trim() && valueElement !== h6) {
                            contactPerson = valueElement.textContent.trim();
                            break;
                        }
                    }
                }
            }
            
            // Номер телефону - шукаємо за текстом заголовка
            for (const h6 of allH6Elements) {
                const text = h6.textContent.trim();
                if (text === 'Номер телефону:') {
                    // Знаходимо батьківський div з класом MuiGrid-container
                    const parentContainer = h6.closest('.MuiGrid-container');
                    if (parentContainer) {
                        // Шукаємо a тег з телефоном
                        const phoneLink = parentContainer.querySelector('a[href^="tel:"]');
                        if (phoneLink && phoneLink.textContent.trim()) {
                            phoneNumber = phoneLink.textContent.trim();
                            break;
                        }
                    }
                }
            }
            
            // Додаткова діагностика для h6 елементів
            console.log('🔍 Діагностика h6 елементів:');
            console.log(`  Знайдено h6 елементів: ${allH6Elements.length}`);
            for (let i = 0; i < Math.min(allH6Elements.length, 20); i++) {
                const text = allH6Elements[i].textContent.trim();
                if (text.includes('оренд') || text.includes('Оренд') || text.includes('договор') || text.includes('Договор') || text.includes('телефон') || text.includes('Телефон') || text.includes('+')) {
                    console.log(`  h6[${i}]: "${text}"`);
                }
            }
            
            // Дата аукціону - шукаємо h5 з датою
            const allH5ForDate = document.querySelectorAll('h5');
            for (const h5 of allH5ForDate) {
                const text = h5.textContent.trim();
                if (text && /\d{2}\.\d{2}\.\d{4}/.test(text)) { // Формат дати DD.MM.YYYY
                    auctionDate = text;
                    break;
                }
            }
            
            // Період подання пропозицій - шукаємо h5 з текстом "Період подання пропозицій"
            const allH5ForProposal = document.querySelectorAll('h5');
            for (const h5 of allH5ForProposal) {
                const text = h5.textContent.trim();
                if (text === 'Період подання пропозицій') {
                    // Знаходимо батьківський div з класом MuiGrid-container
                    const parentContainer = h5.closest('.MuiGrid-container');
                    if (parentContainer) {
                        // Шукаємо h6 елемент з датами
                        const dateElement = parentContainer.querySelector('h6');
                        if (dateElement && dateElement.textContent.trim()) {
                            proposalPeriod = dateElement.textContent.trim();
                            break;
                        }
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
                rentalRate,
                cadastralNumber,
                region,
                settlement,
                organizationName,
                rentalDates,
                contactPerson,
                phoneNumber,
                auctionDate,
                proposalPeriod,
                areaSelectorText,
                areaSelectorClasses,
                areaSelectorParent
            };
        });
        
        console.log(`✅ Зібрано дані для: ${auctionUrl}`);
        console.log(`📝 Опис лоту: ${details.lotDescription.substring(0, 100)}...`);
        console.log(`📊 Зібрані дані:`);
        console.log(`  Площа: ${details.area}`);
        console.log(`  Стартова ціна: ${details.startPrice}`);
        console.log(`  Нормативна оцінка: ${details.normativePrice}`);
        console.log(`  Експертна оцінка: ${details.expertPrice}`);
        console.log(`  Орендна ставка: ${details.rentalRate}`);
        console.log(`  Кадастровий номер: ${details.cadastralNumber}`);
        console.log(`  Область: ${details.region}`);
        console.log(`  Населений пункт: ${details.settlement}`);
        console.log(`  Організація: ${details.organizationName}`);
        console.log(`  ПІБ: ${details.contactPerson}`);
        console.log(`  Телефон: ${details.phoneNumber}`);
        console.log(`  Дата аукціону: ${details.auctionDate}`);
        console.log(`  Період пропозицій: ${details.proposalPeriod}`);
        
        // Додаткова діагностика селекторів
        console.log(`🔍 Діагностика селекторів:`);
        console.log(`  Опис лоту селектор: ${details.lotDescription.substring(0, 50)}...`);
        console.log(`  Площа селектор: ${details.area}`);
        console.log(`  Стартова ціна селектор: ${details.startPrice}`);
        
        // Аналіз всіх h5 елементів на сторінці
        const h5Analysis = await page.evaluate(() => {
            const h5Elements = document.querySelectorAll('h5');
            const h5Data = [];
            h5Elements.forEach((el, index) => {
                h5Data.push({
                    index: index + 1,
                    text: el.textContent.trim(),
                    classes: el.className,
                    parentClasses: el.parentElement ? el.parentElement.className : 'none'
                });
            });
            return h5Data;
        });
        
        console.log(`🔍 Аналіз всіх h5 елементів (${h5Analysis.length}):`);
        h5Analysis.forEach((h5, index) => {
            if (index < 10) { // Показуємо перші 10
                console.log(`  ${h5.index}. "${h5.text}" (класи: ${h5.classes})`);
            }
        });
        
        // Аналіз структури сторінки
        const structureAnalysis = await page.evaluate(() => {
            const structure = [];
            
            // Аналізуємо div елементи
            const divs = document.querySelectorAll('div');
            divs.forEach((div, index) => {
                const h5InDiv = div.querySelector('h5');
                if (h5InDiv) {
                    structure.push({
                        type: 'div',
                        index: index + 1,
                        hasH5: true,
                        h5Text: h5InDiv.textContent.trim(),
                        divClasses: div.className
                    });
                }
            });
            
            return structure.slice(0, 20); // Перші 20 div з h5
        });
        
        console.log(`🔍 Аналіз структури div з h5 (${structureAnalysis.length}):`);
        structureAnalysis.forEach((item, index) => {
            if (index < 10) {
                console.log(`  div ${item.index}: "${item.h5Text}" (класи: ${item.divClasses})`);
            }
        });
        
        // Діагностика селектора площі
        console.log(`🔍 Діагностика селектора площі:`);
        console.log(`  Селектор: h5:nth-of-type(4)`);
        console.log(`  Знайдений текст: "${details.areaSelectorText}"`);
        console.log(`  Класи елемента: ${details.areaSelectorClasses}`);
        console.log(`  Класи батьківського елемента: ${details.areaSelectorParent}`);
        
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
            rentalRate: 'Помилка',
            cadastralNumber: 'Помилка',
            region: 'Помилка',
            settlement: 'Помилка',
            organizationName: 'Помилка',
            rentalDates: 'Помилка',
            contactPerson: 'Помилка',
            phoneNumber: 'Помилка',
            auctionDate: 'Помилка',
            proposalPeriod: 'Помилка'
        };
    }
}

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
            range: 'змінні!B3',
        });
        
        if (response.data.values && response.data.values[0] && response.data.values[0][0]) {
            const baseUrl = response.data.values[0][0].trim();
            console.log(`📋 Отримано BASE_URL з Google таблиці: ${baseUrl}`);
            return baseUrl;
        } else {
            console.log('⚠️ Не знайдено BASE_URL в клітинці змінні!B3, використовую з .env');
            return process.env.BASE_URL;
        }
    } catch (error) {
        console.log('⚠️ Помилка отримання BASE_URL з Google таблиці, використовую з .env:', error.message);
        return process.env.BASE_URL;
    }
}

async function saveToGoogleSheets(data, spreadsheetId) {
    try {
        const sheets = getGoogleSheets();
        
        // Підготовка заголовків
        const headers = ['Лот', 'Назва', 'Дата аукціону', 'Площа', 'Стартова ціна', 'Кадастровий номер', 'Адреса', 'Посилання'];
        
        // Підготовка даних
        const rows = data.map(item => [
            item.lot,
            item.title,
            item.auctionDate,
            item.area,
            item.startPrice,
            item.cadastralNumber,
            item.address,
            item.link
        ]);
        
        // Додаємо заголовки та дані
        const values = [headers, ...rows];
        
        // Очищаємо існуючі дані та додаємо нові
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: 'A:H',
        });
        
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: 'A1',
            valueInputOption: 'RAW',
            resource: { values },
        });
        
        console.log(`✅ Збережено ${data.length} рядків у Google Таблицю`);
        
    } catch (error) {
        console.error('❌ Помилка при збереженні в Google Таблицю:', error.message);
        throw error;
    }
}

async function addRowToGoogleSheets(rowData, spreadsheetId, rowNumber) {
    try {
        const sheets = getGoogleSheets();
        
        // Якщо це перший рядок, додаємо заголовки
        if (rowNumber === 1) {
            const headers = [
                'URL', 'Опис лоту', 'Площа земельної ділянки, га', 'Стартова ціна', 
                'Ціна за га в $', 'Нормативна грошова оцінка, грн', 'Експертна грошова оцінка, грн',
                'Срок окупності', 'Орендна ставка (сума за рік)', 'Кадастровий номер',
                'Область', 'Населений пункт', 'Повна юридична назва організації',
                'Дата початку та закінчення договору оренди', 'ПІБ', 'номер телефону',
                'Дата аукціону', 'Період подання пропозицій'
            ];
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: 'A1',
                valueInputOption: 'RAW',
                resource: { values: [headers] },
            });
        }
        
        // Додаємо рядок даних
        const currentRow = rowNumber + 1; // Номер поточного рядка
        const row = [
            rowData.url,
            rowData.lotDescription,
            rowData.area,
            rowData.startPrice,
            `=IF(AND(ISNUMBER(D${currentRow}),ISNUMBER(C${currentRow})),D${currentRow}/C${currentRow}/'змінні'!B2,"")`, // Ціна за га в $ - формула
            rowData.normativePrice,
            rowData.expertPrice,
            `=IF(ISNUMBER(I${currentRow}),D${currentRow}/I${currentRow},"")`, // Срок окупності - формула
            rowData.rentalRate,
            rowData.cadastralNumber,
            rowData.region,
            rowData.settlement,
            rowData.organizationName,
            rowData.rentalDates,
            rowData.contactPerson,
            rowData.phoneNumber,
            rowData.auctionDate,
            rowData.proposalPeriod
        ];
        
        try {
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `A${rowNumber + 1}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [row] },
            });
            
            console.log(`✅ Додано рядок ${rowNumber + 1}: ${rowData.url}`);
            
        } catch (rangeError) {
            // Якщо помилка з діапазоном, спробуємо розширити таблицю
            if (rangeError.message.includes('exceeds grid limits')) {
                console.log(`📏 Розширюю таблицю для рядка ${rowNumber + 1}...`);
                
                // Отримуємо метадані таблиці
                const metadata = await sheets.spreadsheets.get({
                    spreadsheetId,
                    ranges: ['Sheet1!A:H'],
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
                    range: `A${rowNumber + 1}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [row] },
                });
                
                console.log(`✅ Додано рядок ${rowNumber + 1}: ${rowData.url} (таблицю розширено)`);
            } else {
                throw rangeError;
            }
        }
        
    } catch (error) {
        console.error(`❌ Помилка при додаванні рядка ${rowNumber + 1}:`, error.message);
        throw error;
    }
}

async function main() {
    const browser = await puppeteer.launch({
        headless: 'new', // постав false, якщо треба бачити браузер
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
        BASE = await getBaseUrlFromGoogleSheet();
        if (!BASE) {
            console.error('❌ Не вдалося отримати BASE_URL з Google таблиці або .env файлу');
            return;
        }
        
        // Очищаємо таблицю перед початком
        // Отримуємо поточну кількість рядків у таблиці
        let startRow = 1;
        try {
            const sheets = getGoogleSheets();
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: 'A:A',
            });
            
            if (response.data.values) {
                startRow = response.data.values.length + 1;
            }
            console.log(`📊 Починаю з рядка ${startRow}`);
        } catch (error) {
            console.log('📊 Починаю з першого рядка (новий файл)');
        }

        // Збираємо посилання з усіх сторінок
        console.log('\n🔍 Починаю збір посилань з усіх сторінок...');
        let allLinks = [];
        let currentPage = 1;
        let rowCounter = startRow - 1;

        while (true) {
            const pageUrl = buildPageUrl(BASE, currentPage);
            console.log(`\n📄 Обробляю сторінку ${currentPage}: ${pageUrl}`);
            
            try {
                await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                
                // Додаткове очікування для динамічного контенту
                console.log('⏳ Очікую завантаження динамічного контенту...');
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Перевіряємо чи є посилання на сторінці
                const pageLinks = await getAuctionLinks(page);
                
                if (pageLinks.length === 0) {
                    console.log(`⚠️ Сторінка ${currentPage} порожня, зупиняюсь`);
                    
                    // Додаткова діагностика для порожньої сторінки
                    if (currentPage === 2) {
                        console.log('🔍 Детальна діагностика сторінки 2:');
                        
                        // Перевіряємо URL
                        const currentUrl = page.url();
                        console.log(`   Поточний URL: ${currentUrl}`);
                        
                        // Перевіряємо заголовок сторінки
                        const title = await page.title();
                        console.log(`   Заголовок сторінки: ${title}`);
                        
                        // Перевіряємо всі посилання на сторінці
                        const allLinks = await page.evaluate(() => {
                            const links = document.querySelectorAll('a');
                            return Array.from(links).map(link => ({
                                href: link.getAttribute('href'),
                                text: link.textContent?.trim(),
                                hasH4: !!link.querySelector('h4')
                            }));
                        });
                        
                        console.log(`   Всього посилань на сторінці: ${allLinks.length}`);
                        allLinks.forEach((link, index) => {
                            if (link.href && link.href.includes('/auctions/')) {
                                console.log(`     ${index + 1}. ${link.href} | "${link.text}" | hasH4=${link.hasH4}`);
                            }
                        });
                        
                        // Перевіряємо .MuiPaper-root елементи
                        const paperElements = await page.$$('.MuiPaper-root');
                        console.log(`   .MuiPaper-root елементів: ${paperElements.length}`);
                        
                        // Перевіряємо h4 елементи
                        const h4Elements = await page.$$('h4');
                        console.log(`   h4 елементів: ${h4Elements.length}`);
                        
                        // Зробіть скріншот для аналізу
                        await page.screenshot({ path: `page-${currentPage}-debug.png` });
                        console.log(`   Збережено скріншот: page-${currentPage}-debug.png`);
                    }
                    
                    break;
                }
                
                console.log(`✅ Знайдено ${pageLinks.length} посилань на сторінці ${currentPage}`);
                
                // Обробляємо всі посилання на сторінці
                for (const link of pageLinks) {
                    const url = absolutize(link);
                    rowCounter++;
                    
                    console.log(`\n📋 Обробляю ${rowCounter}: ${url}`);
                    
                    const details = await getAuctionDetails(page, url);
                    
                    // Додаємо рядок одразу в Google Таблицю
                    await addRowToGoogleSheets(details, spreadsheetId, rowCounter);
                }
                
                currentPage++;
                
            } catch (error) {
                console.error(`❌ Помилка при обробці сторінки ${currentPage}:`, error.message);
                break;
            }
        }

        console.log(`\n✅ Збір даних завершено! Оброблено ${currentPage - 1} сторінок, ${rowCounter} аукціонів`);

    } finally {
        await browser.close();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
