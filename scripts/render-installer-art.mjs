import {chromium} from '@playwright/test';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const browser=await chromium.launch({channel:process.env.BUDDY_PLAYWRIGHT_BUNDLED?'chromium':'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:760,height:460},deviceScaleFactor:1});await page.goto(pathToFileURL(path.resolve('installer/macos/background.html')).href);await page.locator('.brand img').evaluate(image=>image.decode());await page.screenshot({path:'src-tauri/icons/installer-dmg.png'});}finally{await browser.close();}
