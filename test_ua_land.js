import puppeteer from 'puppeteer';

async function debugUaLand() {
    const browser = await puppeteer.launch({
        headless: false, // Показуємо браузер для налагодження
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: { width: 1400, height: 900 },
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        // Тестове посилання
        const testUrl = 'https://ua.land/auctions/LAP001-UA-20250729-17116/';
        console.log(`🔍 Тестую посилання: ${testUrl}`);
        
        await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Додаткове очікування для повного завантаження
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('🔍 Розкриваю всі accordion елементи...');
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
        
        // Спочатку перевіримо, чи завантажилася сторінка
        console.log('🔍 Перевіряю завантаження сторінки...');
        const title = await page.title();
        console.log(`  Заголовок сторінки: ${title}`);
        
        // Простий тест
        const simpleTest = await page.evaluate(() => {
            return {
                h4Count: document.querySelectorAll('h4').length,
                h6Count: document.querySelectorAll('h6').length,
                bodyText: document.body.textContent.substring(0, 200)
            };
        });
        
        console.log('📊 Простий тест:');
        console.log(`  H4 елементів: ${simpleTest.h4Count}`);
        console.log(`  H6 елементів: ${simpleTest.h6Count}`);
        console.log(`  Початок тексту: ${simpleTest.bodyText}`);
        
        // Збираємо дані використовуючи логіку з index.js
        const pageStructure = await page.evaluate(() => {
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
                    postalCode: 'Не знайдено',
                    
                    // Діагностичні дані
                    h4Elements: [],
                    h6Elements: [],
                    keywordSearch: {}
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
                
                // Область - шукаємо h6 з текстом "Область:" і беремо наступний h6
                const regionLabel = Array.from(allH6Elements).find(h6 => h6.textContent.trim() === 'Область:');
                if (regionLabel) {
                    // Знаходимо наступний h6 елемент
                    const allH6Array = Array.from(allH6Elements);
                    const regionIndex = allH6Array.indexOf(regionLabel);
                    if (regionIndex !== -1 && regionIndex + 1 < allH6Array.length) {
                        const nextH6 = allH6Array[regionIndex + 1];
                        if (nextH6.textContent.trim() && nextH6.textContent.trim() !== 'Не вказано') {
                            results.region = nextH6.textContent.trim();
                        }
                    }
                }
                
                // Населений пункт - шукаємо h6 з текстом "Населений пункт:" і беремо наступний h6
                const settlementLabel = Array.from(allH6Elements).find(h6 => h6.textContent.trim() === 'Населений пункт:');
                if (settlementLabel) {
                    // Знаходимо наступний h6 елемент
                    const allH6Array = Array.from(allH6Elements);
                    const settlementIndex = allH6Array.indexOf(settlementLabel);
                    if (settlementIndex !== -1 && settlementIndex + 1 < allH6Array.length) {
                        const nextH6 = allH6Array[settlementIndex + 1];
                        if (nextH6.textContent.trim() && nextH6.textContent.trim() !== 'Не вказано') {
                            results.settlement = nextH6.textContent.trim();
                        }
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
                
                // Діагностичні дані
                h4Elements.forEach((h4, index) => {
                    results.h4Elements.push({
                        index: index + 1,
                        text: h4.textContent.trim(),
                        className: h4.className
                    });
                });
                
                allH6Elements.forEach((h6, index) => {
                    results.h6Elements.push({
                        index: index + 1,
                        text: h6.textContent.trim(),
                        className: h6.className
                    });
                });
                
                // Шукаємо по всій сторінці тексти, що містять ключові слова
                const keywords = ['Нормативна грошова оцінка', 'КОАТУУ', 'Координати об\'єкту', 'Класифікація по КОАТУУ'];
                
                keywords.forEach(keyword => {
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            
                    const textNodes = [];
            let node;
                    while (node = walker.nextNode()) {
                        if (node.textContent.includes(keyword)) {
                            const parent = node.parentElement;
                            textNodes.push({
                                text: node.textContent.trim(),
                                parentTag: parent.tagName,
                                parentClass: parent.className
                            });
                        }
                    }
                    
                    results.keywordSearch[keyword] = textNodes;
                });
                
                return results;
            } catch (error) {
                console.error('Помилка в page.evaluate:', error);
                return { error: error.message };
            }
        });
        
        console.log('\n📊 Результати збору даних:');
        
        if (pageStructure.error) {
            console.log(`❌ Помилка: ${pageStructure.error}`);
            return;
        }
        
        if (!pageStructure) {
            console.log('❌ pageStructure не містить даних');
            return;
        }
        
        // Виводимо основні дані
        console.log('\n📋 Основні дані:');
        console.log(`  Опис лоту: ${pageStructure.lotDescription.substring(0, 100)}...`);
        console.log(`  Площа: ${pageStructure.area}`);
        console.log(`  Стартова ціна: ${pageStructure.startPrice}`);
        console.log(`  Нормативна оцінка: ${pageStructure.normativePrice}`);
        console.log(`  Експертна оцінка: ${pageStructure.expertPrice}`);
        console.log(`  Кадастровий номер: ${pageStructure.cadastralNumber}`);
        console.log(`  Область: ${pageStructure.region}`);
        console.log(`  Населений пункт: ${pageStructure.settlement}`);
        console.log(`  Організація: ${pageStructure.organizationName}`);
        console.log(`  Контактна особа: ${pageStructure.contactPerson}`);
        console.log(`  Телефон: ${pageStructure.phoneNumber}`);
        console.log(`  Дата аукціону: ${pageStructure.auctionDate}`);
        console.log(`  Період подачі пропозицій: ${pageStructure.proposalPeriod}`);
        console.log(`  Класифікатор майна: ${pageStructure.propertyClassifier}`);
        console.log(`  Лот виставляється: ${pageStructure.lotExhibitedBy}`);
        console.log(`  Координати: ${pageStructure.coordinates}`);
        console.log(`  КОАТУУ: ${pageStructure.koatuu}`);
        console.log(`  Поштовий індекс: ${pageStructure.postalCode}`);
        
        // Виводимо діагностичні дані
        console.log('\n🔍 Діагностичні дані:');
        console.log(`  H4 елементів: ${pageStructure.h4Elements.length}`);
        console.log(`  H6 елементів: ${pageStructure.h6Elements.length}`);
        
        // Виводимо результати пошуку ключових слів
        console.log('\n🔍 Пошук ключових слів:');
        Object.keys(pageStructure.keywordSearch).forEach(keyword => {
            const results = pageStructure.keywordSearch[keyword];
            console.log(`\n  "${keyword}": знайдено ${results.length} входжень`);
            results.forEach((result, index) => {
                console.log(`    ${index + 1}. "${result.text}" (${result.parentTag}, клас: ${result.parentClass})`);
            });
        });
        
        // Зберігаємо результати в файл
        try {
            const fs = await import('fs');
            fs.writeFileSync('debug_results.json', JSON.stringify(pageStructure, null, 2));
            console.log('\n💾 Результати збережено в debug_results.json');
        } catch (fsError) {
            console.log('\n⚠️ Не вдалося зберегти файл:', fsError.message);
        }
        
        // Пауза для ручного огляду
        console.log('\n⏸️ Пауза для ручного огляду - 30 секунд...');
        console.log('Ви можете відкрити DevTools і подивитися на структуру сторінки');
        await new Promise(resolve => setTimeout(resolve, 30000));
        
    } finally {
        await browser.close();
    }
}

debugUaLand().catch((e) => {
    console.error(e);
    process.exit(1);
});