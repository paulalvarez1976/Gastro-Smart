export const UNIQUE_BUSINESS_ID = import.meta.env.VITE_BUSINESS_ID || 'gastro_smart_main_biz';

export const getAdminEmailsWhitelist = (): string[] => {
  const whitelistEnv = import.meta.env.VITE_ADMIN_EMAILS_WHITELIST || '';
  if (!whitelistEnv.trim()) return [];
  return whitelistEnv.split(',').map((email: string) => email.trim().toLowerCase()).filter(Boolean);
};
