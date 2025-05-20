
// Helper function to check if content is HTML
export const isHTML = (text: string): boolean => {
  return /<\/?[a-z][\s\S]*>/i.test(text);
};