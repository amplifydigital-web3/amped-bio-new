// Helper function for Google Analytics event tracking
export const trackGAEvent = (action: string, category: string, label: string) => {
  if (typeof window.gtag === "function") {
    window.gtag("event", action, {
      event_category: category,
      event_label: label,
    });
  }
};

// Helper function for Twitter conversion tracking
export const trackTwitterEvent = (eventId: string) => {
  if (typeof window !== "undefined" && (window as any).twq) {
    (window as any).twq("event", eventId, {});
  }
};

// Load Twitter Pixel script dynamically
export const loadTwitterPixel = (pixelId: string) => {
  if (typeof window !== "undefined" && !(window as any).twq) {
    // Initialize twq queue
    const win = window as any;
    win.twq = win.twq || [];
    win.twq.push = function (...args: unknown[]) {
      win.twq.queue.push(args);
    };
    win.twq.queue = [];
    win.twq.version = "1.1";

    // Load the Twitter Pixel script
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://static.ads-twitter.com/uwt.js";
    const firstScript = document.getElementsByTagName("script")[0];
    firstScript.parentNode?.insertBefore(script, firstScript);

    // Configure the pixel
    win.twq("config", pixelId);
  }
};
