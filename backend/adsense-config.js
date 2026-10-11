// Public identifiers only. Activation remains blocked pending account and CMP review.
export function readAdSenseConfig(env) {
  const publisher = env.ADSENSE_PUBLISHER_ID || '';
  const slot = env.ADSENSE_LEARNING_SLOT_ID || '';
  if (publisher && !/^ca-pub-\d{16}$/.test(publisher)) throw new Error('ADSENSE_PUBLISHER_ID must be a ca-pub identifier with 16 digits');
  if (slot && !/^\d{10}$/.test(slot)) throw new Error('ADSENSE_LEARNING_SLOT_ID must contain 10 digits');
  return { enabled: false, publisher, slot };
}
