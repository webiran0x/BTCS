// اتصال کیف پول فقط-خواندنی (Read-only).
//
// این ابزار از کیف پول تزریق‌شده (مانند MetaMask، Rabby، Coinbase Wallet، Brave و...) 
// تنها آدرس حساب را با استفاده از مجوز استاندارد `eth_requestAccounts` درخواست می‌کند.
// این کد هرگز درخواست امضا نمی‌کند، هیچ تراکنشی نمی‌سازد و هرگز کلید خصوصی یا عبارت بازیابی (Seed Phrase) 
// را مشاهده نمی‌کند — آدرسی که دریافت می‌شود اطلاعات کاملاً عمومی است که می‌توانید خودتان به صورت دستی وارد کنید.
// این آدرس سپس با همان جستجوی موجودی فقط-خواندنی مشابه آدرس چسبانده‌شده دستی استفاده می‌شود.
import { CHAINS } from './market.js';

// شناسه زنجیره (هگز) -> کلید شبکه مورد استفاده برای جستجوی موجودی فقط-خواندنی.
const CHAIN_BY_ID = { '0x1': 'eth', '0x38': 'bsc', '0x89': 'polygon' };

export const injectedWallet = () => (typeof window === 'undefined' ? null : window.ethereum || null);

export function walletLabel() {
  const p = injectedWallet();
  if (!p) return null;
  if (p.isRabby) return 'Rabby';
  if (p.isCoinbaseWallet) return 'Coinbase Wallet';
  if (p.isBraveWallet) return 'Brave Wallet';
  if (p.isTrust) return 'Trust Wallet';
  if (p.isMetaMask) return 'MetaMask';
  return 'کیف پول شما';
}

/**
- درخواست آدرس‌ها از کیف پول. به { addresses, chain, label } منتج می‌شود.
- در صورت انصراف کاربر یا عدم وجود کیف پول، با یک پیام خوانا رد (reject) می‌شود.
 */
export async function connectWallet() {
  const provider = injectedWallet();
  if (!provider) {
    throw new Error('هیچ کیف پول مرورگری یافت نشد. لطفاً متاماسک (یا هر کیف پول EVM دیگری) را نصب کنید، یا آدرس عمومی خود را جای‌گذاری کنید — هر دو در اینجا به صورت فقط-خواندنی هستند.');
  }
  let accounts;
  try {
    accounts = await provider.request({ method: 'eth_requestAccounts' });
  } catch (e) {
    if (e?.code === 4001) throw new Error('شما اتصال را رد کردید. هیچ اطلاعاتی به اشتراک گذاشته نشد.');
    throw new Error(e?.message || 'کیف پول اتصال را رد کرد.');
  }
  if (!accounts?.length) throw new Error('کیف پول هیچ آدرسی را بازگردانی نکرد.');

  let chain = 'eth';
  try {
    const id = await provider.request({ method: 'eth_chainId' });
    chain = CHAIN_BY_ID[id] || 'eth';
  } catch { /* پیش‌فرض روی اتریوم */ }

  return {
    addresses: accounts.filter((a) => CHAINS.eth.pattern.test(a)),
    chain,
    label: walletLabel(),
  };
}

/** هنگامی که شخص حساب یا شبکه خود را در کیف پول تغییر دهد، این تابع اجرا می‌شود. */
export function onWalletChange(handler) {
  const provider = injectedWallet();
  if (!provider?.on) return () => {};
  const onAccounts = (accs) => handler({ type: 'accounts', addresses: accs });
  const onChain = (id) => handler({ type: 'chain', chain: CHAIN_BY_ID[id] || 'eth' });
  provider.on('accountsChanged', onAccounts);
  provider.on('chainChanged', onChain);
  return () => {
    provider.removeListener?.('accountsChanged', onAccounts);
    provider.removeListener?.('chainChanged', onChain);
  };
}