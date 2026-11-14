// admin.med101.space serves ONLY the admin portal (every path), and signs out
// anyone who is not on the admin list. The student app lives on the main domain.
export const IS_ADMIN_HOST =
  typeof window !== 'undefined' && /^admin\./i.test(window.location.hostname);
export const MAIN_SITE_URL = 'https://med101.space';
