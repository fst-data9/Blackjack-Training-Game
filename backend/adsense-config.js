// Public identifiers only. Activation remains blocked pending account and CMP review.
export function readAdSenseConfig(env) {
  const publisher = env.ADSENSE_PUBLISHER_ID || '';
  if (publisher && !/^ca-pub-\d{16}$/.test(publisher)) throw new Error('ADSENSE_PUBLISHER_ID must be a ca-pub identifier with 16 digits');
  const slots = {};
  for (const [placement, name] of Object.entries({
    'learning-end': 'ADSENSE_LEARNING_SLOT_ID',
    'learning-incontent': 'ADSENSE_LEARNING_INCONTENT_SLOT_ID',
    'game-below-stats': 'ADSENSE_GAME_SLOT_ID',
    'review-summary': 'ADSENSE_REVIEW_SLOT_ID',
  })) {
    const slot = env[name] || '';
    if (slot && !/^\d{10}$/.test(slot)) throw new Error(`${name} must contain 10 digits`);
    slots[placement] = slot;
  }
  return { enabled: false, publisher, slots };
}
