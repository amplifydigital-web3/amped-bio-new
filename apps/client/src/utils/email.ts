/**
 * Masks an email address for privacy
 * Example: john.doe@example.com -> j******e@e*****.com
 * 
 * @param email The email address to mask
 * @returns The masked email address
 */
export const maskEmail = (email: string): string => {
  const [username, domain] = email.split('@');
  if (!username || !domain) return '***@***';
  
  const maskedUsername = username.length <= 2
    ? '*'.repeat(username.length)
    : username[0] + '*'.repeat(username.length - 2) + username[username.length - 1];
  
  const domainParts = domain.split('.');
  const tld = domainParts.pop() || '';
  const domainName = domainParts.join('.');
  
  const maskedDomain = domainName.length <= 2
    ? '*'.repeat(domainName.length)
    : domainName[0] + '*'.repeat(domainName.length - 1);
  
  return `${maskedUsername}@${maskedDomain}.${tld}`;
};

/**
 * Alternative way to obscure an email address with dots
 * Example: john.doe@example.com -> j•••••e@example.com
 * 
 * @param email The email address to obscure
 * @returns The obscured email address
 */
export const obscureEmail = (email: string): string => {
  const [username, domain] = email.split('@');
  if (!username || !domain) return '•••@•••';
  
  const obscuredUsername =
    username.charAt(0) +
    '•'.repeat(Math.min(username.length - 1, 5)) +
    (username.length > 6 ? username.charAt(username.length - 1) : '');
  
  return `${obscuredUsername}@${domain}`;
};
