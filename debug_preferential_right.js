import puppeteer from 'puppeteer';

async function debugPreferentialRight() {
    const browser = await puppeteer.launch({
        headless: false, // Показуємо браузер для дебагу
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: { width: 1400, height: 900 },
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        const auctionUrl = 'https://prozorro.sale/auction/LAE001-UA-20241206-83575/';
        const resultsUrl = 'https://auction.prozorro.sale/LAE001-UA-20241206-83575/';

        console.log('🔍 Переходжу на сторінку аукціону...');
        await page.goto(auctionUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Спочатку перевіримо оригінальну сторінку на наявність інформації про переважне право
        console.log('🔍 Шукаю інформацію про переважне право на оригінальній сторінці...');
        const originalPageAnalysis = await page.evaluate(() => {
            const analysis = {
                priorityInfo: [],
                pageText: document.body.innerText
            };

            // Шукаємо всі елементи, які можуть містити інформацію про переважне право
            const possibleElements = document.querySelectorAll('*');
            possibleElements.forEach((element, index) => {
                const text = element.textContent.toLowerCase();
                if (text.includes('переважне право') || text.includes('переважним правом') || text.includes('priority')) {
                    analysis.priorityInfo.push({
                        tagName: element.tagName,
                        className: element.className,
                        text: element.textContent.trim(),
                        html: element.outerHTML
                    });
                }
            });

            return analysis;
        });

        console.log('\n📋 Інформація про переважне право на оригінальній сторінці:');
        if (originalPageAnalysis.priorityInfo.length > 0) {
            originalPageAnalysis.priorityInfo.forEach((info, index) => {
                console.log(`  ${index + 1}. ${info.tagName}.${info.className}: ${info.text}`);
            });
        } else {
            console.log('  Не знайдено інформації про переважне право');
        }

        console.log('🔍 Переходжу на сторінку результатів...');
        await page.goto(resultsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Збираємо детальну інформацію про структуру сторінки
        const pageAnalysis = await page.evaluate(() => {
            const analysis = {
                priorityStep: null,
                resultsWrapper: null,
                winnerElement: null,
                allResults: [],
                priorityBidderElements: [],
                pageText: document.body.innerText
            };

            // Аналізуємо .priority-step
            const priorityStep = document.querySelector('.priority-step');
            if (priorityStep) {
                analysis.priorityStep = {
                    text: priorityStep.textContent.trim(),
                    html: priorityStep.outerHTML,
                    classes: priorityStep.className
                };
            }

            // Аналізуємо .results-wrapper
            const resultsWrapper = document.querySelector('.results-wrapper');
            if (resultsWrapper) {
                analysis.resultsWrapper = {
                    html: resultsWrapper.outerHTML,
                    resultsCount: resultsWrapper.querySelectorAll('.results').length
                };

                // Аналізуємо всі результати
                const allResults = resultsWrapper.querySelectorAll('.results');
                allResults.forEach((result, index) => {
                    const resultData = {
                        index: index,
                        classes: result.className,
                        text: result.textContent.trim(),
                        html: result.outerHTML
                    };

                    // Перевіряємо чи це переможець
                    if (result.classList.contains('is-winner')) {
                        resultData.isWinner = true;
                        analysis.winnerElement = resultData;
                    }

                    // Шукаємо елементи переважного права
                    const priorityBidder = result.querySelector('.results__priority-bidder, .results__warning.results__priority-bidder');
                    if (priorityBidder) {
                        resultData.priorityBidder = {
                            text: priorityBidder.textContent.trim(),
                            html: priorityBidder.outerHTML,
                            classes: priorityBidder.className
                        };
                        analysis.priorityBidderElements.push(resultData);
                    }

                    analysis.allResults.push(resultData);
                });
            }

            return analysis;
        });

        console.log('\n📊 === АНАЛІЗ СТОРІНКИ ===');
        console.log('URL:', resultsUrl);
        
        console.log('\n🔍 Priority Step:');
        if (pageAnalysis.priorityStep) {
            console.log('  Текст:', pageAnalysis.priorityStep.text);
            console.log('  Класи:', pageAnalysis.priorityStep.classes);
            console.log('  HTML:', pageAnalysis.priorityStep.html);
        } else {
            console.log('  Не знайдено');
        }

        console.log('\n🏆 Results Wrapper:');
        if (pageAnalysis.resultsWrapper) {
            console.log('  Кількість результатів:', pageAnalysis.resultsWrapper.resultsCount);
            console.log('  HTML:', pageAnalysis.resultsWrapper.html);
        } else {
            console.log('  Не знайдено');
        }

        console.log('\n👑 Winner Element:');
        if (pageAnalysis.winnerElement) {
            console.log('  Текст:', pageAnalysis.winnerElement.text);
            console.log('  Класи:', pageAnalysis.winnerElement.classes);
            console.log('  HTML:', pageAnalysis.winnerElement.html);
        } else {
            console.log('  Не знайдено');
        }

        console.log('\n🎯 Priority Bidder Elements:');
        if (pageAnalysis.priorityBidderElements.length > 0) {
            pageAnalysis.priorityBidderElements.forEach((element, index) => {
                console.log(`  ${index + 1}. Текст:`, element.priorityBidder.text);
                console.log(`     Класи:`, element.priorityBidder.classes);
                console.log(`     HTML:`, element.priorityBidder.html);
            });
        } else {
            console.log('  Не знайдено');
        }

        console.log('\n📋 Всі результати:');
        pageAnalysis.allResults.forEach((result, index) => {
            console.log(`  ${index + 1}. Класи: ${result.classes}`);
            console.log(`     Текст: ${result.text.substring(0, 100)}...`);
            if (result.priorityBidder) {
                console.log(`     Priority Bidder: ${result.priorityBidder.text}`);
            }
        });

        // Тестуємо виправлену логіку
        console.log('\n🧪 === ТЕСТУВАННЯ ВИПРАВЛЕНОЇ ЛОГІКИ ===');
        
        const currentLogicResult = await page.evaluate(() => {
            let preferentialRightStatus = 'Не знайдено';
            
            // Виправлена логіка обробки переважного права
            // 1. Спочатку шукаємо .priority-step
            const priorityStep = document.querySelector('.priority-step');
            if (priorityStep) {
                const priorityText = priorityStep.textContent.trim().toLowerCase();
                
                if (priorityText.includes('учасник з переважним правом не скористався ним')) {
                    preferentialRightStatus = 'Не скористався';
                } else if (priorityText.includes('учасник з переважним правом був відсутній')) {
                    preferentialRightStatus = 'Був відсутній';
                } else {
                    // Якщо в .priority-step назва підприємства (не статус), перевіряємо чи це переможець
                    const resultsWrapper = document.querySelector('.results-wrapper');
                    if (resultsWrapper) {
                        const winnerElement = resultsWrapper.querySelector('.results.is-winner');
                        if (winnerElement) {
                            const winnerText = winnerElement.querySelector('.results__text');
                            if (winnerText && priorityStep.textContent.trim().includes(winnerText.textContent.trim())) {
                                preferentialRightStatus = 'Скористався';
                            } else {
                                preferentialRightStatus = 'Не скористався';
                            }
                        } else {
                            preferentialRightStatus = 'Не скористався';
                        }
                    } else {
                        preferentialRightStatus = 'Не скористався';
                    }
                }
            } else {
                // 2. Якщо .priority-step не знайдено, перевіряємо переможця на наявність priority-bidder
                const resultsWrapper = document.querySelector('.results-wrapper');
                if (resultsWrapper) {
                    const winnerElement = resultsWrapper.querySelector('.results.is-winner');
                    if (winnerElement) {
                        const priorityBidder = winnerElement.querySelector('.results__priority-bidder, .results__warning.results__priority-bidder');
                        if (priorityBidder) {
                            preferentialRightStatus = 'Скористався';
                        } else {
                            // Якщо немає priority-bidder у переможця, це означає що на аукціоні не було учасника з переважним правом
                            preferentialRightStatus = 'Немає учасника з переважним правом';
                        }
                    } else {
                        preferentialRightStatus = 'Немає інформації про переважне право';
                    }
                } else {
                    preferentialRightStatus = 'Немає інформації про переважне право';
                }
            }
            
            return {
                result: preferentialRightStatus,
                priorityStepFound: !!priorityStep,
                resultsWrapperFound: !!document.querySelector('.results-wrapper'),
                winnerElementFound: !!document.querySelector('.results.is-winner'),
                priorityBidderFound: !!document.querySelector('.results__priority-bidder, .results__warning.results__priority-bidder')
            };
        });

        console.log('Результат поточної логіки:', currentLogicResult.result);
        console.log('Priority Step знайдено:', currentLogicResult.priorityStepFound);
        console.log('Results Wrapper знайдено:', currentLogicResult.resultsWrapperFound);
        console.log('Winner Element знайдено:', currentLogicResult.winnerElementFound);
        console.log('Priority Bidder знайдено:', currentLogicResult.priorityBidderFound);

        // Пауза для можливості подивитися на браузер
        console.log('\n⏸️ Пауза 10 секунд для огляду браузера...');
        await new Promise(resolve => setTimeout(resolve, 10000));

    } finally {
        await browser.close();
    }
}

debugPreferentialRight().catch(console.error);
