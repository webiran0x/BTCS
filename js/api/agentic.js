// چارچوب ایجنت‌ها: ارکستراسیون وظایف رویدادمحور برای عملیات معاملاتی
// ارائه‌دهنده یک چارچوب ایجنت الهام‌گرفته از سیستم‌های خودکار که چندین ایجنت
// معاملاتی (اسکنر بازار، متوازن‌کننده سبد دارایی، مدیریت ریسک و غیره) را هماهنگ می‌کند.

import { CONFIG } from '../config.js';
import { $, $$ , toast } from '../ui.js';

const AGENT_KEY = 'BTCSAgents';
const TASK_LOG_KEY = 'BTCSTaskLog';
const MAX_TASKS = 100;

// کلاس پایه ایجنت
class BaseAgent {
  constructor(name, priority = 'normal') {
    this.name = name;
    this.priority = priority;
    this.status = 'idle'; // آماده به‌کار (idle)، در حال اجرا (running)، تکمیل‌شده (completed)، ناموفق (failed)
    this.tasksCompleted = 0;
    this.tasksFailed = 0;
    this.lastRun = null;
    this.metrics = {
      signalsGenerated: 0,
      tradesExecuted: 0,
      riskEvents: 0,
      accuracy: 0.0,
    };
  }

  getStatus() {
    return {
      name: this.name,
      status: this.status,
      priority: this.priority,
      tasksCompleted: this.tasksCompleted,
      tasksFailed: this.tasksFailed,
      lastRun: this.lastRun,
      metrics: { ...this.metrics },
    };
  }

  async run(context) {
    // کلاس‌های فرزند باید این متد را پیاده‌سازی کنند
    throw new Error('متد run() باید توسط کلاس فرزند پیاده‌سازی شود');
  }

  recordSignal(signalType, details = {}) {
    this.metrics.signalsGenerated++;
    toast(`سیگنال: ${signalType}`, 'info');
    this.logTask('signal', signalType, details);
  }

  recordTrade(tradeType, result, details = {}) {
    this.metrics.tradesExecuted++;
    const status = result.profit >= 0 ? 'up' : 'down';
    toast(`${tradeType} — ${result.pnlPct}% ${status}`, status);
    this.logTask('trade', tradeType, { ...result, status });
  }

  recordRiskEvent(event, details = {}) {
    this.metrics.riskEvents++;
    toast(`ریسک: ${event}`, 'down');
    this.logTask('risk', event, details);
  }

  logTask(type, detail, data = {}) {
    const logEntry = {
      id: Date.now() + Math.random(),
      type,
      detail,
      data,
      timestamp: new Date().toISOString(),
    };

    let log = [];
    try {
      const stored = localStorage.getItem(TASK_LOG_KEY);
      if (stored) log = JSON.parse(stored);
    } catch (e) {}

    log.unshift(logEntry);

    // نگهداری فقط آخرین MAX_TASKS ورودی
    if (log.length > MAX_TASKS) log = log.slice(0, MAX_TASKS);

    try {
      localStorage.setItem(TASK_LOG_KEY, JSON.stringify(log));
    } catch (e) {}
  }

  getTaskLog() {
    let log = [];
    try {
      const stored = localStorage.getItem(TASK_LOG_KEY);
      if (stored) log = JSON.parse(stored);
    } catch (e) {}
    return log.slice(0, 20); // بازگرداندن ۲۰ ورودی آخر
  }
}

// ایجنت اسکنر بازار
class MarketScannerAgent extends BaseAgent {
  constructor() {
    super('MarketScanner', 'high');
  }

  async run(context = {}) {
    this.status = 'running';
    this.lastRun = new Date().toISOString();

    try {
      const markers = await this.scanMarkets(context);
      this.recordSignal('market_scan', { markers });
      this.status = 'completed';
      return markers;
    } catch (err) {
      this.status = 'failed';
      this.recordRiskEvent('خطا در اسکن بازار: ' + err.message);
      throw err;
    }
  }

  async scanMarkets(context) {
    // اسکن فرصت‌های معاملاتی در سراسر یونیورس‌های پیکربندی‌شده
    const universe = context.universe || CONFIG.DEFAULT_UNIVERSE || ['BTC', 'ETH', 'ADA', 'SOL'];
    const opportunities = [];

    for (const symbol of universe) {
      try {
        // دریافت داده‌های بازار
        const marketData = await this.getMarketData(symbol);
        if (!marketData) continue;

        // بررسی الگوها/فرصت‌ها
        const opportunitiesForSymbol = this.checkPatterns(symbol, marketData);
        opportunities.push(...opportunitiesForSymbol);
      } catch (err) {
        console.warn(`خطا در اسکن ${symbol}:`, err);
      }
    }

    // مرتب‌سازی بر اساس امتیاز (بالاترین ابتدا)
    opportunities.sort((a, b) => b.score - a.score);

    return opportunities.slice(0, 20); // بازگرداندن ۲۰ مورد برتر
  }

  async getMarketData(symbol) {
    // دریافت داده‌های بازار از APIهای تنظیم‌شده
    const rest = CONFIG.BINANCE_REST[0];
    try {
      const response = await fetch(`${rest}/api/v3/ticker/24h?symbol=${symbol.toUpperCase()}USDT`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return {
        symbol,
        price: parseFloat(data.lastPrice),
        change24h: parseFloat(data.priceChangePercent),
        high24h: parseFloat(data.highPrice),
        low24h: parseFloat(data.lowPrice),
        volume24h: parseFloat(data.volume),
      };
    } catch (err) {
      console.warn(`دریافت داده‌های بازار برای ${symbol} ناموفق بود:`, err);
      return null;
    }
  }

  checkPatterns(symbol, marketData) {
    // تشخیص الگوی ساده برای فرصت‌ها
    const opportunities = [];
    const { price, change24h, volume24h } = marketData;

    // الگوی مومنتوم: مومنتوم صعودی قوی + حجم بالا
    if (change24h && change24h > 5 && volume24h > 1000000) {
      opportunities.push({
        symbol,
        type: 'momentum',
        score: change24h,
        description: `${symbol} با حجم بالا نشان‌دهنده مومنتوم صعودی قوی ${change24h}% است`,
      });
    }

    // الگوی بازگشتی: حرکت شدید + سیگنال بازگشت به میانگین
    if (change24h && Math.abs(change24h) > 10) {
      opportunities.push({
        symbol,
        type: 'reversal',
        score: -Math.abs(change24h),
        description: `${symbol} نشان‌دهنده ${change24h > 0 ? 'سود' : 'زیان'} شدید — احتمال بازگشت روند`,
      });
    }

    return opportunities;
  }
}

// ایجنت متوازن‌کننده سبد دارایی
class PortfolioRebalancerAgent extends BaseAgent {
  constructor() {
    super('PortfolioRebalancer', 'medium');
  }

  async run(context = {}) {
    this.status = 'running';
    this.lastRun = new Date().toISOString();

    try {
      const rebalancing = await this.rebalance(context);
      this.recordSignal('rebalance', { rebalancing });
      this.status = 'completed';
      return rebalancing;
    } catch (err) {
      this.status = 'failed';
      this.recordRiskEvent('توازن مجدد سبد دارایی ناموفق بود: ' + err.message);
      throw err;
    }
  }

  async rebalance(context) {
    const portfolio = context.portfolio || {};
    const targetAllocation = context.targetAllocation || {};

    if (!portfolio || !Object.keys(portfolio).length) {
      return { action: 'no_portfolio', reason: 'داده‌ای برای سبد دارایی وجود ندارد' };
    }

    const currentValues = {};
    let totalValue = 0;

    // دریافت ارزش‌های فعلی
    for (const [symbol, pos] of Object.entries(portfolio)) {
      const price = context.priceFeed ? context.priceFeed[symbol] : 0;
      currentValues[symbol] = price * pos.quantity;
      totalValue += currentValues[symbol];
    }

    if (totalValue === 0) {
      return { action: 'no_value', reason: 'ارزش سبد دارایی صفر است' };
    }

    // محاسبه مقادیر هدف
    const rebalancing = {
      action: 'rebalance',
      current: { ...currentValues },
      totalValue,
      adjustments: [],
    };

    // مقایسه با تخصیص هدف
    for (const [symbol, targetPct] of Object.entries(targetAllocation)) {
      const currentPct = totalValue > 0 ? currentValues[symbol] / totalValue : 0;
      const targetValue = totalValue * targetPct;
      const adjustment = targetValue - currentValues[symbol];

      if (Math.abs(adjustment) > totalValue * 0.05) { // آستانه ۵ درصد
        rebalancing.adjustments.push({
          symbol,
          currentPct: (currentPct * 100).toFixed(2),
          targetPct: (targetPct * 100).toFixed(2),
          adjustment,
          action: adjustment > 0 ? 'buy' : 'sell',
          adjustmentPct: (Math.abs(adjustment) / totalValue * 100).toFixed(2),
        });
      }
    }

    // مرتب‌سازی تعدیل‌ها بر اساس مقدار مطلق (بزرگ‌ترین ابتدا)
    rebalancing.adjustments.sort((a, b) => Math.abs(b.adjustment) - Math.abs(a.adjustment));

    return rebalancing;
  }
}

// ایجنت مدیر ریسک
class RiskManagerAgent extends BaseAgent {
  constructor() {
    super('RiskManager', 'critical');
  }

  async run(context = {}) {
    this.status = 'running';
    this.lastRun = new Date().toISOString();

    try {
      const riskAssessment = await this.assessRisk(context);
      this.status = 'completed';
      return riskAssessment;
    } catch (err) {
      this.status = 'failed';
      this.recordRiskEvent('ارزیابی ریسک ناموفق بود: ' + err.message);
      throw err;
    }
  }

  async assessRisk(context) {
    const portfolio = context.portfolio || {};
    const marketData = context.marketData || {};

    if (!portfolio || !Object.keys(portfolio).length) {
      return { riskLevel: 'none', score: 0, events: [] };
    }

    const events = [];
    let riskScore = 0; // مقیاس ۰ تا ۱۰۰

    // بررسی ریسک تمرکز
    const positions = Object.values(portfolio);
    const totalExposure = positions.reduce((sum, pos) => sum + pos.notional, 0);

    if (totalExposure > 0) {
      // تمرکز سنگین روی یک موقعیت
      const topPosition = Math.max(...positions.map(p => p.notional), 0);
      const concentration = topPosition / totalExposure;

      if (concentration > 0.5) {
        events.push({
          type: 'concentration',
          severity: 'high',
          message: `موقعیت برتر ${(concentration * 100).toFixed(1)}% از کل سبد دارایی را تشکیل می‌دهد`,
        });
        riskScore += 25;
      }

      // بررسی مارجین / اهرم (Leverage)
      for (const pos of positions) {
        if (pos.leverage && pos.leverage > 3) {
          events.push({
            type: 'leverage',
            severity: 'medium',
            message: `رمزارز ${pos.symbol} از اهرم ${pos.leverage} برابری استفاده می‌کند`,
          });
          riskScore += 10;
        }
      }
    }

    // بررسی ریسک بازار
    if (marketData.fearGreed !== undefined) {
      if (marketData.fearGreed < 25) {
        events.push({
          type: 'sentiment',
          severity: 'high',
          message: 'ترس شدید در بازار — انتظار نوسانات بالا می‌رود',
        });
        riskScore += 15;
      } else if (marketData.fearGreed > 75) {
        events.push({
          type: 'sentiment',
          severity: 'medium',
          message: 'طمع شدید در بازار — پتانسیل اصلاح قیمت وجود دارد',
        });
        riskScore += 10;
      }
    }

    // تعیین سطح کلی ریسک
    let riskLevel = 'low';
    if (riskScore >= 50) riskLevel = 'critical';
    else if (riskScore >= 30) riskLevel = 'high';
    else if (riskScore >= 15) riskLevel = 'medium';

    return {
      riskLevel,
      score: riskScore,
      events,
      timestamp: new Date().toISOString(),
    };
  }
}

// راه‌اندازی و مدیریت چارچوب ایجنت‌ها
export function initAgenticFramework() {
  // راه‌اندازی ایجنت‌های پیش‌فرض
  const agents = {
    marketScanner: new MarketScannerAgent(),
    portfolioRebalancer: new PortfolioRebalancerAgent(),
    riskManager: new RiskManagerAgent(),
  };

  // ذخیره در localStorage
  try {
    localStorage.setItem(AGENT_KEY, JSON.stringify({
      agents: Object.fromEntries(
        Object.entries(agents).map(([name, agent]) => [name, {
          name: agent.name,
          priority: agent.priority,
          status: agent.status,
          tasksCompleted: agent.tasksCompleted,
          tasksFailed: agent.tasksFailed,
          lastRun: agent.lastRun,
          metrics: agent.metrics,
        }])
      ),
      created: new Date().toISOString(),
    }));
  } catch (e) {}

  return agents;
}

export function createAgent(agentType) {
  const agents = {
    marketScanner: new (require('./api/agentic.js').MarketScannerAgent)(),
    portfolioRebalancer: new (require('./api/agentic.js').PortfolioRebalancerAgent)(),
    riskManager: new (require('./api/agentic.js').RiskManagerAgent)(),
  };

  if (agents[agentType]) {
    return new agents[agentType]();
  }
  throw new Error(`نوع ایجنت ناشناخته: ${agentType}`);
}

export async function runAgentTask(agentName, task, context = {}) {
  const agents = await loadAgents();
  const agent = agents[agentName];

  if (!agent) {
    throw new Error(`ایجنت ${agentName} یافت نشد`);
  }

  agent.status = 'running';
  agent.lastRun = new Date().toISOString();

  try {
    const result = await agent.run(context);
    agent.status = 'completed';
    agent.tasksCompleted++;
    toast(`ایجنت ${agentName} وظیفه را تکمیل کرد: ${task}`, 'up');
    return result;
  } catch (err) {
    agent.status = 'failed';
    agent.tasksFailed++;
    toast(`ایجنت ${agentName} با خطا مواجه شد: ${err.message}`, 'down');
    throw err;
  } finally {
    // ذخیره وضعیت ایجنت
    try {
      const stored = localStorage.getItem(AGENT_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        data.agents[agentName] = {
          name: agent.name,
          priority: agent.priority,
          status: agent.status,
          tasksCompleted: agent.tasksCompleted,
          tasksFailed: agent.tasksFailed,
          lastRun: agent.lastRun,
          metrics: agent.metrics,
        };
        localStorage.setItem(AGENT_KEY, JSON.stringify(data));
      }
    } catch (e) {}
  }
}

async function loadAgents() {
  try {
    const stored = localStorage.getItem(AGENT_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return data.agents || {};
    }
  } catch (e) {}
  return await initAgenticFramework();
}
