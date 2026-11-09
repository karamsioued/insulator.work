/* Shared live database (Supabase). Fill these 3 values to turn on sync between all devices.
   Leave url empty to keep the app local-only on each device. The key is the public "anon / publishable" key — safe in a public site:
   the data itself is locked to devices linked with the workshop password. */
window.INS_CLOUD = {
  url: 'https://aowyyxvbyhmvzmhhpdqc.supabase.co',
  key: 'sb_publishable_BtfssWC0sgAFeORyysIjbw_k9bGMWQD',
  email: 'karamtafwm@gmail.com', // workshop account (Supabase → Authentication → Users). The password is NOT stored here: each device types it once.
};
