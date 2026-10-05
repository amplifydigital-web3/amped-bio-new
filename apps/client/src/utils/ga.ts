// Helper function for Google Analytics event tracking
export const trackGAEvent = (action: string, category: string, label: string) => {
  if (typeof window.gtag === "function") {
    window.gtag("event", action, {
      event_category: category,
      event_label: label,
    });
  }
};
