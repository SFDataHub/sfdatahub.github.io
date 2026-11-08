// Historical panels are independent of the favorite header action. Current
// coordinator, profile adapter, Hero, Overlay and favorite action remain real.
export default function None() { return null; }

export const useFeatureAccess = () => ({ loading: false, canAccessFeature: () => true });
