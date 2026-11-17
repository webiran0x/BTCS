// لایه تحلیل‌گر: ارائه‌دهنده تحلیل بازار، احساسات و پیش‌بینی‌های مبتنی بر هوش مصنوعی
// به صورت محلی در مرورگر بازدیدکننده با استفاده از WebLLM اجرا می‌شود — بدون نیاز به کلید API.

import { CONFIG } from '../config.js';
import { $, icon } from '../ui.js';

const ANALYST_KEY = 'BTCSAnalystCache';
const CACHE_TTL = 60 * 60 * 1000; // کش ۱ ساعته

export async function startAnalyst() {
  // راه‌اندازی تحلیل‌گر WebLLM در صورتی که در حال اجرا نباشد
  if (window.BTCSAnalyst) {
    return window.BTCSAnalyst;
  }

  const { createWebLLM } = await import('./webllm-loader.js');
  const modelConfig = CONFIG.WEBLLM_MODELS?.[1] || {}; // پیش‌فرض روی مدل پیشنهادی

  window.BTCSAnalyst = createWebLLM({
    model: modelConfig.id,
    onProgress: (progress) => {
      // به‌روزرسانی رابط کاربری با پیشرفت تحلیل
      const progressEl = $('#analystProgress');
      if (progressEl) {
        progressEl.style.width = `${progress * 100}%`;
      }
    },
    onToken: (token) => {
      // ارسال تدریجی توکن‌های تحلیل به رابط کاربری
      const textEl = $('#analystText');
      if (textEl) {
        textEl.textContent += token;
      }
    },
  });

  return window.BTCSAnalyst;
}

export async function getAnalysis(query, context = {}) {
  // ساخت زمینه (Context) برای تحلیل‌گر
  const marketData = context.marketData || {};
  const portfolio = context.portfolio || {};
  const symbols = context.symbols || [];

  const prompt = `شما یک تحلیل‌گر بازار ارزهای دیجیتال برای پلتفرم BTCS هستید. 
یک تحلیل مختصر (حداکثر ۳۰۰ کلمه) شامل موارد زیر ارائه دهید:
1. روند فعلی بازار برای: ${symbols.join(', ') || 'جفت‌ارزهای اصلی'}
2. واکنش‌های قیمتی اخیر و سطوح کلیدی
3. ارزیابی احساسات (شاخص ترس و طمع، سیگنال‌های اجتماعی)
4. کاتالیزورهای بالقوه کوتاه‌مدت
5. ملاحظات مربوط به ریسک

نمای کلی داده‌های بازار:
- تغییرات قیمت (۲۴ ساعت): ${JSON.stringify(marketData.priceChanges || {})}
- شاخص ترس و طمع: ${marketData.fearGreed || 'ناموجود'}
- دارایی‌های سبد: ${JSON.stringify(portfolio.holdings || {})}

تحلیل را مبتنی بر واقعیت نگه دارید، هرگز قیمت‌های آینده را پیش‌بینی نکنید و یک سلب مسئولیت اضافه کنید که این تحلیل توسط هوش مصنوعی و صرفاً برای اهداف اطلاعاتی تولید شده است.`;

  try {
    const analyst = await startAnalyst();
    const analysis = await analyst.generate(prompt, {
      maxTokens: 500,
      temperature: 0.3,
      stream: true,
    });

    // ذخیره تحلیل در کش
    setAnalysisCache(query, analysis);

    return analysis;
  } catch (err) {
    console.error('خطای تحلیل‌گر:', err);
    return generateFallbackAnalysis(query, marketData);
  }
}

function generateFallbackAnalysis(query, marketData) {
  const fng = marketData.fearGreed !== undefined ?
    (marketData.fearGreed < 25 ? 'ترس شدید' : marketData.fearGreed > 75 ? 'طمع شدید' : 'خنثی') :
    'ناموجود';

  return `<div class="card mt analyst-card" dir="rtl">
    <div class="card-h"><h3>${icon('ai', 16)} تحلیل بازار</h3></div>
    <p class="fine">تحلیل هوش مصنوعی در حال حاضر در دسترس نیست. شرایط بازار:</p>
    <ul>
      <li>شاخص ترس و طمع: <b>${fng}</b></li>
      <li>وضعیت بازار: ${marketData.trend === 'bull' ? 'صعودی (Bullish)' : marketData.trend === 'bear' ? 'نزولی (Bearish)' : 'رنج / خنثی'}</li>
      <li>مشاهده کلیدی: ${marketData.observation || 'مشاهده خاصی در دسترس نیست'}</li>
    </ul>
    <p class="fine mt">این یک تحلیل جایگزین ایستا است. برای دریافت بینش‌های لحظه‌ای هوش مصنوعی، لطفاً صفحه را رفرش کنید یا از پشتیبانی مرورگر خود از WebLLM اطمینان حاصل نمایید.</p>
  </div>`;
}

export function setAnalysisCache(query, analysis) {
  try {
    const cache = {
      query,
      analysis,
      timestamp: Date.now(),
    };
    localStorage.setItem(ANALYST_KEY, JSON.stringify(cache));
  } catch (e) {
    // حافظه محلی پر یا غیرفعال است - بدون صدا نادیده گرفته می‌شود
  }
}

export function getAnalysisCache() {
  try {
    const cached = localStorage.getItem(ANALYST_KEY);
    if (!cached) return null;
    const data = JSON.parse(cached);
    // بررسی اعتبار زمانی کش (TTL)
    if (Date.now() - data.timestamp > CACHE_TTL) {
      localStorage.removeItem(ANALYST_KEY);
      return null;
    }
    return data.analysis;
  } catch (e) {
    return null;
  }
}
